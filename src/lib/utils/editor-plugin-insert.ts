/**
 * Plugin toolbar buttons in the markdown editor can open a modal that returns
 * markdown to insert. These helpers handle the editor side of that contract:
 * the selection the modal is told about, where its result lands, and what is
 * selected afterwards.
 */

/** Handed to a plugin's editor modal as its `editorContext` property. */
export interface EditorContext {
	/** The text selected in the editor when the button was clicked ('' for a plain cursor). */
	selectedText: string;
	/** Offsets of that selection in the document. */
	from: number;
	to: number;
	/** The content language being edited ('' when the site isn't multilingual or it's unknown). */
	contentLanguage: string;
}

/** What a plugin's editor modal resolves with. */
export interface PluginInsertResult {
	/** Markdown that replaces the selection the modal was opened with. */
	insertContent?: string;
	/**
	 * What to select afterwards, as offsets into `insertContent`. `to` defaults
	 * to `from` (a cursor). Without it the cursor goes after the inserted text.
	 */
	select?: { from: number; to?: number };
}

export interface Range {
	from: number;
	to: number;
}

/**
 * Where the modal's markdown goes. The range captured when the button was
 * clicked, as long as the document still holds the same text there (focus
 * leaves the editor while the modal is open, but a collaborator or a sync can
 * still change the document). Otherwise the editor's current selection.
 */
export function insertTarget(
	captured: Range & { text: string },
	current: Range,
	docLength: number,
	slice: (from: number, to: number) => string
): Range {
	if (captured.to <= docLength && slice(captured.from, captured.to) === captured.text) {
		return { from: captured.from, to: captured.to };
	}
	return current;
}

/** The selection after inserting `length` characters at `at`. */
export function selectionAfterInsert(
	result: PluginInsertResult,
	at: number,
	length: number
): { anchor: number; head: number } {
	const clamp = (n: unknown) => {
		const v = typeof n === 'number' && Number.isFinite(n) ? Math.trunc(n) : length;
		return at + Math.min(Math.max(v, 0), length);
	};
	if (result.select && typeof result.select === 'object') {
		const anchor = clamp(result.select.from);
		const head = result.select.to === undefined ? anchor : clamp(result.select.to);
		return { anchor, head };
	}
	return { anchor: at + length, head: at + length };
}
