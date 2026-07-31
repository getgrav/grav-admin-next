/**
 * Helpers for list rows that navigate to an edit screen (admin2#144).
 *
 * Those rows have to be real `<a href>` elements, not buttons: only an anchor
 * gives the browser something to act on for Cmd/Ctrl+Click, middle-click, and
 * the right-click "Open Link in New Tab" menu. The click handler then bows out
 * whenever the user asked for one of those, and only takes over the plain,
 * unmodified left click that the SPA is meant to handle itself.
 *
 * One thing to watch when converting a button to a link: anchors are draggable
 * by default, buttons are not. Inside a row that has its own drag-to-reorder
 * handlers, set `draggable={!reorderMode}` on the anchor so the row's drag is
 * the only one in play and the link can't be dragged out of the app.
 */

/**
 * True when the browser's own link handling should be left alone: a modified
 * click (new tab, new window, download) or anything other than a plain primary
 * button press.
 */
export function isModifiedClick(event: MouseEvent): boolean {
	return (
		event.defaultPrevented ||
		event.button !== 0 ||
		event.metaKey ||
		event.ctrlKey ||
		event.shiftKey ||
		event.altKey
	);
}

/**
 * Wrap an existing navigate callback for use as an anchor's `onclick`. Plain
 * clicks are intercepted and routed through `navigate` (preserving whatever
 * side effects the SPA attaches to it); everything else falls through to the
 * browser.
 */
export function linkClick(navigate: () => void) {
	return (event: MouseEvent) => {
		if (isModifiedClick(event)) return;
		event.preventDefault();
		navigate();
	};
}
