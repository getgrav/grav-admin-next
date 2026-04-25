/**
 * Generic Svelte-form ↔ Y.Map binding.
 *
 * Mirrors the page editor's `headerData` tree into a shared `Y.Map` so
 * every blueprint field — not just the content body — syncs between
 * collaborators. Long-form text fields (markdown, editor, textarea, yaml)
 * use a nested `Y.Text` for character-level merging; everything else is
 * stored as a scalar in the enclosing `Y.Map`, which gives last-write-wins
 * semantics per key (appropriate for toggles, selects, dates, etc.).
 *
 * Arrays are synced as JSON-round-tripped scalar replacements for the MVP.
 * That means concurrent list edits don't CRDT-merge — the later write
 * wins. A future iteration can lift arrays into `Y.Array`. The cost for
 * that simplification is low in practice because most list fields in Grav
 * blueprints are short (tags, authors, menu items) and rarely co-edited.
 *
 * Schema awareness:
 *   Field paths whose blueprint type is in `RICH_TEXT_TYPES` get `Y.Text`.
 *   Everything else falls through to scalar. Blueprint-type inference is
 *   done once at construction and cached in a `paths` map.
 *
 * Origin tagging: local writes use `localOrigin`; remote applies use
 * `remoteOrigin`. Observers filter on these to avoid echo loops.
 */

import * as Y from 'yjs';
import type { BlueprintField, BlueprintSchema } from '$lib/api/endpoints/blueprints';

const RICH_TEXT_TYPES = new Set([
	'markdown',
	'editor',
	'textarea',
	'yaml',
	'html',
	'frontmatter',
]);

export type FieldShape = 'ytext' | 'scalar';

export interface FormBindingOptions {
	doc: Y.Doc;
	blueprint: BlueprintSchema | null;
	/** Dot-prefixed paths of fields rendered outside the blueprint (e.g. 'content'). */
	extraRichTextPaths?: string[];
	localOrigin: symbol;
	remoteOrigin: symbol;
}

export interface FormBinding {
	/** Push a local field change into the Y.Doc. */
	pushLocal(path: string, value: unknown): void;
	/** Replace the whole form (e.g., on initial load). Only seeds if Y.Map empty. */
	seed(data: Record<string, unknown>): void;
	/** Read the current merged tree back out. */
	getValue(): Record<string, unknown>;
	/** Subscribe to remote-origin updates. Receives the full merged tree. */
	onRemote(handler: (data: Record<string, unknown>) => void): () => void;
	/** Raw Y.Map — useful for tests or special-case bindings. */
	readonly map: Y.Map<unknown>;
	/** Is a given path currently a Y.Text (for caller optimization)? */
	isText(path: string): boolean;
	/**
	 * Resolve a dot path to the Y.Text living there, creating it if the
	 * path is text-shaped and absent. Used by editor bindings (CodeMirror
	 * yCollab, ProseMirror y-text bridges) that want to share the same
	 * Y.Text instance the form is mirroring rather than holding a copy.
	 */
	getText(path: string): Y.Text | null;
	dispose(): void;
}

/**
 * Walk the blueprint and build a map of path → shape.
 * Nested fieldsets / sections propagate their children with the parent's
 * name as prefix when the parent has a name; otherwise the children are
 * flattened into the parent scope (matching how the Grav form flattens
 * unnamed sections into their parent).
 */
function buildShapeMap(
	fields: BlueprintField[] | undefined,
	prefix: string,
	out: Map<string, FieldShape>,
): void {
	if (!fields) return;
	for (const f of fields) {
		const name = f.name ?? '';
		const path = prefix && name ? `${prefix}.${name}` : (name || prefix);
		if (f.fields && f.fields.length > 0) {
			buildShapeMap(f.fields, path, out);
			continue;
		}
		if (!path) continue;
		out.set(path, RICH_TEXT_TYPES.has(f.type) ? 'ytext' : 'scalar');
	}
}

export function createFormBinding(opts: FormBindingOptions): FormBinding {
	const { doc, blueprint, extraRichTextPaths = [], localOrigin, remoteOrigin } = opts;
	const map = doc.getMap<unknown>('form');

	// Build path → shape
	const shapes = new Map<string, FieldShape>();
	buildShapeMap(blueprint?.fields, '', shapes);
	for (const p of extraRichTextPaths) shapes.set(p, 'ytext');

	const remoteHandlers = new Set<(data: Record<string, unknown>) => void>();

	function isText(path: string): boolean {
		return shapes.get(path) === 'ytext';
	}

	/**
	 * Resolve a dot path to { parent: Y.Map, key: lastSegment }, creating
	 * intermediate Y.Maps as needed. Used for writes.
	 */
	function resolveForWrite(path: string): { parent: Y.Map<unknown>; key: string; fullPath: string } | null {
		if (!path) return null;
		const segs = path.split('.');
		const key = segs.pop() as string;
		let cursor: Y.Map<unknown> = map;
		for (const seg of segs) {
			const existing = cursor.get(seg);
			if (existing instanceof Y.Map) {
				cursor = existing as Y.Map<unknown>;
			} else {
				const child = new Y.Map<unknown>();
				cursor.set(seg, child);
				cursor = child;
			}
		}
		return { parent: cursor, key, fullPath: path };
	}

	/**
	 * Resolve a dot path for reading. Returns the Y-typed value at the
	 * leaf or undefined if the path doesn't exist.
	 */
	function resolveForRead(path: string): unknown {
		const segs = path.split('.');
		let cursor: unknown = map;
		for (const seg of segs) {
			if (cursor instanceof Y.Map) {
				cursor = (cursor as Y.Map<unknown>).get(seg);
			} else {
				return undefined;
			}
		}
		return cursor;
	}

	/** Apply a diff-based string update to a Y.Text inside a transaction. */
	function applyTextDiff(ytext: Y.Text, newValue: string): void {
		const oldValue = ytext.toString();
		if (oldValue === newValue) return;

		let prefix = 0;
		const minLen = Math.min(oldValue.length, newValue.length);
		while (prefix < minLen && oldValue[prefix] === newValue[prefix]) prefix++;

		let suffix = 0;
		while (
			suffix < oldValue.length - prefix &&
			suffix < newValue.length - prefix &&
			oldValue[oldValue.length - 1 - suffix] === newValue[newValue.length - 1 - suffix]
		) suffix++;

		const deleteLen = oldValue.length - prefix - suffix;
		const insertStr = newValue.slice(prefix, newValue.length - suffix);

		if (deleteLen > 0) ytext.delete(prefix, deleteLen);
		if (insertStr.length > 0) ytext.insert(prefix, insertStr);
	}

	function pushLocal(path: string, value: unknown): void {
		const target = resolveForWrite(path);
		if (!target) return;
		const { parent, key } = target;

		doc.transact(() => {
			if (isText(path) && typeof value === 'string') {
				let ytext = parent.get(key);
				if (!(ytext instanceof Y.Text)) {
					ytext = new Y.Text();
					parent.set(key, ytext);
				}
				applyTextDiff(ytext as Y.Text, value);
			} else {
				// Scalar / JSON-round-tripped. Equality check against current
				// value to avoid dirtying Y.Map for unchanged writes.
				const current = parent.get(key);
				if (!(current instanceof Y.AbstractType) && equalJson(current, value)) return;
				parent.set(key, cloneJson(value));
			}
		}, localOrigin);
	}

	/**
	 * Serialize a Y tree back into a plain JS object. Y.Text → string,
	 * Y.Map → object, Y.Array → array, scalars → themselves.
	 */
	function serialize(value: unknown): unknown {
		if (value instanceof Y.Text) return value.toString();
		if (value instanceof Y.Map) {
			const out: Record<string, unknown> = {};
			(value as Y.Map<unknown>).forEach((v, k) => { out[k] = serialize(v); });
			return out;
		}
		if (value instanceof Y.Array) {
			return (value as Y.Array<unknown>).toArray().map(serialize);
		}
		return value;
	}

	function getValue(): Record<string, unknown> {
		return serialize(map) as Record<string, unknown>;
	}

	/**
	 * Seed the Y.Map from initial data, only if it's currently empty.
	 * Subsequent joiners will find the map non-empty and inherit state.
	 */
	function seed(data: Record<string, unknown>): void {
		if (map.size > 0) return;
		doc.transact(() => {
			seedInto(map, data, '');
		}, localOrigin);
	}

	function seedInto(target: Y.Map<unknown>, data: Record<string, unknown>, prefix: string): void {
		for (const [k, v] of Object.entries(data)) {
			const path = prefix ? `${prefix}.${k}` : k;
			if (isText(path) && typeof v === 'string') {
				const t = new Y.Text();
				t.insert(0, v);
				target.set(k, t);
			} else if (v && typeof v === 'object' && !Array.isArray(v)) {
				const child = new Y.Map<unknown>();
				target.set(k, child);
				seedInto(child, v as Record<string, unknown>, path);
			} else {
				target.set(k, cloneJson(v));
			}
		}
	}

	// Single deep observer — emits the full rebuilt tree on any remote change.
	const observer = (_events: Array<Y.YEvent<Y.AbstractType<unknown>>>, tx: Y.Transaction) => {
		if (tx.origin === localOrigin) return;
		const snapshot = getValue();
		for (const h of remoteHandlers) h(snapshot);
	};
	map.observeDeep(observer);

	function onRemote(handler: (data: Record<string, unknown>) => void): () => void {
		remoteHandlers.add(handler);
		return () => remoteHandlers.delete(handler);
	}

	function getText(path: string): Y.Text | null {
		if (!isText(path)) return null;
		const target = resolveForWrite(path);
		if (!target) return null;
		const existing = target.parent.get(target.key);
		// Important: do NOT materialize a Y.Text when missing — that
		// would push map.size above zero before seed runs and trip the
		// "map.size === 0 → seed" check the caller relies on.
		return existing instanceof Y.Text ? existing : null;
	}

	function dispose(): void {
		map.unobserveDeep(observer);
		remoteHandlers.clear();
	}

	// Consume remoteOrigin so the linter doesn't flag it; reserved for
	// symmetry with other binding constructors and future use when we
	// apply external updates programmatically.
	void remoteOrigin;

	return { pushLocal, seed, getValue, onRemote, map, isText, getText, dispose };
}

// ---- helpers -----------------------------------------------------------

function cloneJson<T>(v: T): T {
	if (v === null || typeof v !== 'object') return v;
	// structuredClone handles Dates, Maps, Sets, nested — good enough for
	// blueprint values which are all JSON-serializable anyway.
	return structuredClone(v);
}

function equalJson(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (a === null || b === null) return false;
	if (typeof a !== typeof b) return false;
	if (typeof a !== 'object') return false;
	try {
		return JSON.stringify(a) === JSON.stringify(b);
	} catch {
		return false;
	}
}
