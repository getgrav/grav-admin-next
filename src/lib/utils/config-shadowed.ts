/**
 * Pure helpers for "shadowed" config values: keys that a layer ABOVE the one
 * being edited sets, so a value saved here is not what the site uses.
 *
 * The API lists them in `meta.shadowed` on config responses (and as
 * `enabled_source` on installed plugins). Two sources exist:
 *
 *   environment  the booted environment's file (user/env/<E>/config/...) sets
 *                the key while the admin is saving to base ("Default").
 *   server       a GRAV_CONFIG__* server environment variable sets it, which
 *                wins over every file layer.
 *
 * No Svelte or $lib imports here, so tests/config-shadowed.test.ts can load it
 * directly. See docs/config-overrides-revert.md.
 */

export type ShadowSource = 'environment' | 'server';

export interface ShadowedEntry {
	/** Dotted leaf path relative to the scope, e.g. `enabled` or `smtp.password`. */
	path: string;
	source: ShadowSource;
	/** The environment whose file sets it (`environment` source only). */
	environment: string | null;
	/** That file, relative to the Grav root (`environment` source only). */
	file: string | null;
	/** The value the site actually uses. Secrets arrive masked. */
	value: unknown;
}

/** Where a plugin's live `enabled` value comes from, when it is not base. */
export interface EnabledSource {
	source: ShadowSource;
	environment: string | null;
	file: string | null;
}

/** Read `meta.shadowed` from a config response, dropping anything malformed. */
export function readShadowed(meta: unknown): ShadowedEntry[] {
	const raw = (meta && typeof meta === 'object' ? (meta as { shadowed?: unknown }).shadowed : undefined);
	if (!Array.isArray(raw)) return [];
	const out: ShadowedEntry[] = [];
	for (const item of raw) {
		if (!item || typeof item !== 'object') continue;
		const e = item as Record<string, unknown>;
		if (typeof e.path !== 'string' || (e.source !== 'environment' && e.source !== 'server')) continue;
		out.push({
			path: e.path,
			source: e.source,
			environment: typeof e.environment === 'string' && e.environment !== '' ? e.environment : null,
			file: typeof e.file === 'string' && e.file !== '' ? e.file : null,
			value: e.value,
		});
	}
	return out;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return !!v && typeof v === 'object' && !Array.isArray(v);
}

function flattenLeaves(obj: Record<string, unknown>, prefix: string, out: Map<string, unknown>): void {
	for (const [key, value] of Object.entries(obj)) {
		const path = prefix ? `${prefix}.${key}` : key;
		// Lists are atomic leaves, the same as the API's ConfigDiffer::flattenLeaves.
		if (isPlainObject(value) && Object.keys(value).length > 0) {
			flattenLeaves(value, path, out);
		} else {
			out.set(path, value);
		}
	}
}

/**
 * Dotted leaf paths whose value differs between two versions of a form's data
 * (added, removed or changed). Lists compare as one value.
 */
export function changedLeafPaths(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
	const a = new Map<string, unknown>();
	const b = new Map<string, unknown>();
	flattenLeaves(before ?? {}, '', a);
	flattenLeaves(after ?? {}, '', b);
	const changed: string[] = [];
	for (const path of new Set([...a.keys(), ...b.keys()])) {
		if (JSON.stringify(a.get(path)) !== JSON.stringify(b.get(path))) changed.push(path);
	}
	return changed;
}

/** Is `path` the same as `other`, or nested under it? */
function within(path: string, other: string): boolean {
	return path === other || path.startsWith(other + '.');
}

/**
 * The shadowed entries a save actually ran into: every entry whose path is one
 * of the changed paths, nested under one, or a parent of one.
 */
export function shadowedHits(changed: string[], shadowed: ShadowedEntry[]): ShadowedEntry[] {
	if (changed.length === 0 || shadowed.length === 0) return [];
	return shadowed.filter((e) => changed.some((c) => within(e.path, c) || within(c, e.path)));
}

/**
 * The entry to show on a field: its own path first, else anything nested under
 * it (an object-valued field). A server entry wins over an environment one.
 * `exact` says whether `value` is the field's own value.
 */
export function shadowForField(
	path: string,
	shadowed: ShadowedEntry[],
): { entry: ShadowedEntry; exact: boolean } | null {
	if (!path || shadowed.length === 0) return null;
	const own = shadowed.find((e) => e.path === path);
	if (own) return { entry: own, exact: true };
	const nested = shadowed.filter((e) => e.path.startsWith(path + '.'));
	if (nested.length === 0) return null;
	return { entry: nested.find((e) => e.source === 'server') ?? nested[0], exact: false };
}

/**
 * Should a plugin's `enabled_source` mark its toggle? A server variable always
 * wins. An environment file only matters while saving to base ("Default"):
 * when the admin is on that environment the toggle writes there, and on any
 * other environment it edits that host's own layer by design.
 */
export function enabledSourceApplies(source: EnabledSource | null | undefined, target: string): boolean {
	if (!source) return false;
	if (source.source === 'server') return true;
	return target === '' && !!source.environment;
}

/**
 * The plugin's real enabled state after its toggle saved `requested`. When a
 * layer above the one written decides `enabled`, the site keeps that value, and
 * the toggle shows it rather than the value that was just saved.
 */
export function liveEnabledAfterToggle(requested: boolean, shadowed: ShadowedEntry[]): boolean {
	const entry = shadowed.find((e) => e.path === 'enabled');
	if (!entry) return requested;
	const v = entry.value;
	return v === true || v === 1 || v === '1' || v === 'true';
}

/** Render a shadowed value for display. Labels come from the caller (i18n). */
export function formatShadowValue(
	value: unknown,
	labels: { on: string; off: string; empty: string },
): string {
	if (value === true) return labels.on;
	if (value === false) return labels.off;
	if (value === null || value === undefined || value === '') return labels.empty;
	if (typeof value === 'object') return JSON.stringify(value);
	return String(value);
}
