/**
 * Dot-path writes for page header edits.
 *
 * Blueprint field names address nested frontmatter with dots, and a numeric
 * segment is a list index: `header.paneles.0.kicker` is the `kicker` of the
 * first entry in the `paneles` list. Both helpers keep lists as lists.
 */

type Container = Record<string, unknown> | unknown[];

function isContainer(value: unknown): value is Container {
	return value !== null && typeof value === 'object';
}

function copyContainer(value: Container): Container {
	return Array.isArray(value) ? [...value] : { ...value };
}

/**
 * Return a copy of `data` with `value` set at `path`, copying each container on
 * the way down so the original is never mutated. Lists are copied as lists:
 * spreading `[a, b]` into `{ ... }` would turn it into `{ "0": a, "1": b }`.
 */
export function setByPath<T extends Record<string, unknown>>(data: T, path: string, value: unknown): T {
	const parts = path.split('.');
	const root: Record<string, unknown> = { ...data };
	let current: Container = root;
	for (let i = 0; i < parts.length - 1; i++) {
		const parent = current as Record<string, unknown>;
		const child = parent[parts[i]];
		const next = isContainer(child) ? copyContainer(child) : {};
		parent[parts[i]] = next;
		current = next;
	}
	(current as Record<string, unknown>)[parts[parts.length - 1]] = value;
	return root as T;
}

/**
 * Turn blueprint field edits (header-relative dot paths mapped to values) into
 * the partial header a normal-mode save sends.
 *
 * The API merges that partial header over the one on disk, but it replaces a
 * list outright rather than merging into it. So an edit that reaches into a
 * list (`paneles.0.kicker`) has to send the whole list with that one entry
 * changed. Sending only `{ paneles: { 0: { kicker } } }` replaced every entry
 * with a single one holding just `kicker` (getgrav/grav-plugin-admin2#174).
 *
 * A map value is merged the same way, so a key the field dropped (a row
 * removed from the Page Groups picker, say) would survive the save. When
 * `saved` (the header as stored) is given, each key it has that the new map
 * lacks is sent as `null`, which the API treats as "remove this key".
 *
 * `base` is the current header the edits were made against; lists are copied
 * from it, and neither it nor `saved` is mutated.
 */
export function buildHeaderPatch(
	changes: Record<string, unknown>,
	base: Record<string, unknown>,
	saved: Record<string, unknown> = {},
): Record<string, unknown> {
	const patch: Record<string, unknown> = {};
	for (const [dotPath, value] of Object.entries(changes)) {
		const parts = dotPath.split('.');
		let target: Container = patch;
		let source: unknown = base;
		let stored: unknown = saved;
		let inList = false;
		for (let i = 0; i < parts.length - 1; i++) {
			const key = parts[i];
			const sourceChild = isContainer(source) ? (source as Record<string, unknown>)[key] : undefined;
			const parent = target as Record<string, unknown>;
			if (!isContainer(parent[key])) {
				// Below a list the patch carries a full copy of it, so the other
				// entries survive the server replacing the list wholesale.
				parent[key] = Array.isArray(sourceChild) ? JSON.parse(JSON.stringify(sourceChild)) : {};
			}
			if (Array.isArray(sourceChild)) inList = true;
			target = parent[key] as Container;
			source = sourceChild;
			stored = isContainer(stored) ? (stored as Record<string, unknown>)[key] : undefined;
		}
		const last = parts[parts.length - 1];
		const storedValue = isContainer(stored) ? (stored as Record<string, unknown>)[last] : undefined;
		// Inside a list the server replaces the whole list, so nothing to remove.
		(target as Record<string, unknown>)[last] = inList ? value : withRemovals(value, storedValue);
	}
	return patch;
}

function isMap(value: unknown): value is Record<string, unknown> {
	return isContainer(value) && !Array.isArray(value);
}

/** `value` with every key `stored` has and `value` lacks set to null, at any depth of maps. */
function withRemovals(value: unknown, stored: unknown): unknown {
	if (!isMap(value) || !isMap(stored)) return value;
	const out: Record<string, unknown> = { ...value };
	for (const key of Object.keys(stored)) {
		out[key] = key in value ? withRemovals(value[key], stored[key]) : null;
	}
	return out;
}
