/**
 * Access maps as Grav stores them, and as the permissions editor reads them.
 *
 * Grav keeps an account's or group's rules as a flat list keyed by dotted
 * permission name (`api.system.backup`). A nested map can't hold a value for
 * `api.system` and a key below it at once, so when a rule overrides the one
 * above it (`api.system: true`, `api.system.backup: false`) core keeps the
 * child as a dotted key next to the nested map:
 *
 *   { api: { system: true }, 'api.system.backup': false }
 *
 * The editor reads every map into the flat form with flattenAccessRules() and
 * writes it back with serializeAccessRules(), which builds the same structure
 * core's Access::toArray() returns, so a map that wasn't edited saves with the
 * same meaning.
 */

/** Flat rules keyed by dotted permission name, in the order they were read. */
export type AccessRules = Record<string, unknown>;

/** Keys that would write to an object's prototype instead of the object. */
const UNSAFE_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Read an access map into flat rules: nested keys and top-level dotted keys
 * become the same dotted name. A later key wins over an earlier one, like
 * core's `Utils::arrayFlattenDotNotation()`. Empty branches and null values
 * carry no rule and are left out. Anything else (booleans, and the odd string
 * or number a hand-edited file may hold) is kept as it is.
 */
export function flattenAccessRules(
	access: unknown,
	prefix = '',
	out: AccessRules = {}
): AccessRules {
	if (!isPlainObject(access)) return out;
	for (const [key, value] of Object.entries(access)) {
		const name = prefix ? `${prefix}.${key}` : key;
		if (isPlainObject(value) || Array.isArray(value)) {
			// PHP sends an empty map as `[]`; an array holds no rules either way.
			if (isPlainObject(value)) flattenAccessRules(value, name, out);
		} else if (value !== null && value !== undefined) {
			out[name] = value;
		}
	}
	return out;
}

/** The nearest rule above `name` (`api.system` for `api.system.backup`), if any. */
export function parentRule(rules: AccessRules, name: string): string | null {
	for (let pos = name.lastIndexOf('.'); pos > 0; pos = name.lastIndexOf('.', pos - 1)) {
		const parent = name.slice(0, pos);
		if (Object.hasOwn(rules, parent)) return parent;
	}
	return null;
}

/**
 * The value `name` ends up with: its own rule, else the nearest rule above it,
 * the same lookup core's `Access::get()` does. Undefined when nothing applies.
 */
export function effectiveRule(rules: AccessRules, name: string): unknown {
	if (Object.hasOwn(rules, name)) return rules[name];
	const parent = parentRule(rules, name);
	return parent === null ? undefined : rules[parent];
}

/**
 * Write flat rules back as an access map: rules with no rule above them go
 * into the nested map, and a rule below another rule keeps its dotted key at
 * the top level, after the nested map, as core's `Access::toArray()` does.
 *
 * Unlike core, a child rule that repeats its parent is kept: it is still the
 * rule the editor shows, and it matters again as soon as the parent changes.
 */
export function serializeAccessRules(rules: AccessRules): Record<string, unknown> {
	const nested: Record<string, unknown> = {};
	const overrides: Record<string, unknown> = {};

	for (const [name, value] of Object.entries(rules)) {
		const parts = name.split('.');
		if (parts.some((part) => part === '' || UNSAFE_SEGMENTS.has(part))) continue;

		if (parentRule(rules, name) !== null) {
			overrides[name] = value;
			continue;
		}

		// No rule above this one, so nothing on the way down is a value already.
		let node = nested;
		for (const part of parts.slice(0, -1)) {
			if (!isPlainObject(node[part])) node[part] = {};
			node = node[part] as Record<string, unknown>;
		}
		node[parts[parts.length - 1]] = value;
	}

	return { ...nested, ...overrides };
}

/**
 * Set or clear one rule and return the new flat rules (the input isn't changed).
 *
 * Clearing a rule removes its key, so a dotted key that is cleared is gone and
 * nothing else changes.
 *
 * A rule that already exists changes in place, dotted key or not. Before a
 * new rule is added, a plain allow or deny above it (`api.pages: true`) is
 * copied onto that node's known children (`childNames`), keeping any child
 * that already has a rule of its own, and then removed (admin2#50). The new
 * rule then needs no dotted key, so it saves the same way on every Grav
 * version.
 */
export function setAccessRule(
	rules: AccessRules,
	name: string,
	state: 'allowed' | 'denied' | 'unset',
	childNames: (name: string) => string[]
): AccessRules {
	const next: AccessRules = { ...rules };
	if (state === 'unset') {
		delete next[name];
		return next;
	}

	if (Object.hasOwn(next, name)) {
		next[name] = state === 'allowed';
		return next;
	}

	const parts = name.split('.');
	for (let i = 1; i < parts.length; i++) {
		const ancestor = parts.slice(0, i).join('.');
		const blanket = next[ancestor];
		if (typeof blanket !== 'boolean') continue;
		for (const child of childNames(ancestor)) {
			if (!Object.hasOwn(next, child)) next[child] = blanket;
		}
		delete next[ancestor];
	}

	next[name] = state === 'allowed';
	return next;
}
