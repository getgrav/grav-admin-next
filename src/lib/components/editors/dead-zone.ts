import type { EditorView } from '@codemirror/view';

/**
 * Clicking anywhere in a CodeMirror editor box should focus the editor
 * (admin2#61). CodeMirror only listens for mousedown on its contentDOM, so
 * any part of the box that contentDOM doesn't cover (the space below a short
 * document, the box's own padding or min-height, the scroller around the
 * content) is dead to clicks. Chrome usually hides this by moving the caret
 * into the nearest editable element on its own; Firefox and Safari don't.
 *
 * Every editor component in this folder routes its box's mousedown through
 * focusOnDeadZoneClick(); tests/editor-dead-zone.test.ts fails if one stops.
 */

/** The parts of an editor box a click can land on. */
export interface EditorBoxParts {
	/** The component's wrapper element that the mousedown listener sits on. */
	box: Node;
	/** view.dom (.cm-editor) */
	editor: Node;
	/** view.scrollDOM (.cm-scroller) */
	scroller: Node;
	/** view.contentDOM (.cm-content) */
	content: Node;
}

/**
 * True when the click target is an empty part of the box: the wrapper, the
 * editor frame, or the scroller, but not the content (CodeMirror handles
 * that), not a gutter (line numbers and fold markers take their own clicks),
 * and not a panel or tooltip (Find/Replace, the vim command line), whose
 * inputs and buttons need their own focus (grav-admin-next#24).
 */
export function isDeadZone(target: Node | null, parts: EditorBoxParts): boolean {
	if (!target) return false;
	if (parts.content.contains(target)) return false;
	if (target === parts.box || target === parts.editor) return true;
	if (!parts.scroller.contains(target)) return false;
	const el = target as Element;
	return typeof el.closest !== 'function' || !el.closest('.cm-gutters');
}

/**
 * mousedown handler for an editor box. Focuses the view and places the cursor
 * at the position nearest the click (the end of the document for a click
 * below the last line). Returns true when it handled the click.
 */
export function focusOnDeadZoneClick(e: MouseEvent, view: EditorView | undefined | null, box: Node | null): boolean {
	if (!view || !box || e.button !== 0) return false;
	const target = e.target as Node | null;
	if (!isDeadZone(target, { box, editor: view.dom, scroller: view.scrollDOM, content: view.contentDOM })) return false;
	// Leave the scrollbars of the scroller and of a scrolling box alone.
	if ((target === view.scrollDOM || target === box) && onScrollbar(target as Element, e)) return false;
	e.preventDefault();
	const pos = view.posAtCoords({ x: e.clientX, y: e.clientY }, false) ?? view.state.doc.length;
	view.dispatch({ selection: { anchor: pos } });
	view.focus();
	return true;
}

function onScrollbar(el: Element, e: MouseEvent): boolean {
	const r = el.getBoundingClientRect();
	return e.clientX > r.left + el.clientLeft + el.clientWidth || e.clientY > r.top + el.clientTop + el.clientHeight;
}
