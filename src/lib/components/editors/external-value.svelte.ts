import { Annotation } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

/**
 * Marks a transaction that loads a new `value` from the parent. The editor's
 * update listener skips these, so the parent isn't told about a change it made
 * itself (a `null` it gave would come back as `''` and mark the form dirty).
 */
export const externalValue = Annotation.define<boolean>();

/**
 * The smallest single replacement that turns `current` into `next`, so a cursor
 * outside the changed part stays where it was. `null` when they're equal.
 */
export function replaceChange(current: string, next: string): { from: number; to: number; insert: string } | null {
	if (current === next) return null;
	const max = Math.min(current.length, next.length);
	let from = 0;
	while (from < max && current.charCodeAt(from) === next.charCodeAt(from)) from++;
	let tail = 0;
	while (
		tail < max - from &&
		current.charCodeAt(current.length - 1 - tail) === next.charCodeAt(next.length - 1 - tail)
	) {
		tail++;
	}
	return { from, to: current.length - tail, insert: next.slice(from, next.length - tail) };
}

/**
 * Keeps a CodeMirror view showing its `value` prop when the parent changes it
 * (a refetched record, a revert, an undo). Call it during component init.
 *
 * `value` is read first, before anything can return early. An $effect only
 * re-runs for the reactive values it actually read, and the view is a plain
 * variable that is created after the effect's first run, so a `view && value`
 * check never read `value` and the editor never saw a new one (admin2#198).
 *
 * `paused` is for collaborative editing, where the shared Y.Text owns the
 * document and a replacement from here would fight the CRDT.
 */
export function syncExternalValue(
	value: () => string | null | undefined,
	view: () => EditorView | undefined,
	paused: () => boolean = () => false
): void {
	$effect(() => {
		const next = value() ?? '';
		if (paused()) return;
		const editor = view();
		if (!editor) return; // not created yet; it starts from the current value
		const change = replaceChange(editor.state.doc.toString(), next);
		if (change) editor.dispatch({ changes: change, annotations: externalValue.of(true) });
	});
}
