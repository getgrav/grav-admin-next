/**
 * Page media changes made from the page editor itself
 * (getgrav/grav-plugin-admin2#220).
 *
 * Every page media write (upload, delete, alt/title metadata) answers with
 * `pages:update:<route>`, because the page's media changed. The page editor
 * listens for that event to pick up edits made in another tab: with no unsaved
 * edits it reloads the page, which swaps the form for "Loading page…" and
 * drops the view back to the top; with unsaved edits it toasts that the page
 * changed elsewhere. Neither is right when the change came from this editor.
 * Media are not part of the page record or its ETag, and the media panel
 * already updates its own list, so there is nothing to reload.
 *
 * Each write goes through `pageMediaWrite()`, and the editor's invalidation
 * guard reads `isPageMediaWriting()` to skip the echo. The API client emits a
 * response's `X-Invalidates` tags before the request's promise resolves, so
 * the echo always arrives while the write is still counted. Uploads sent by
 * XHR (Uppy) bypass the client and emit `pageMediaTags()` by hand, inside a
 * `pageMediaWrite()` too.
 */

let inFlight = 0;

/** True while a page media write made here is being sent. */
export function isPageMediaWriting(): boolean {
	return inFlight > 0;
}

/** Run a page media write (or a hand-made emit of its tags) as our own. */
export async function pageMediaWrite<T>(write: () => T | Promise<T>): Promise<T> {
	inFlight++;
	try {
		return await write();
	} finally {
		inFlight--;
	}
}

/**
 * The tags the API answers a page media write with, for uploads that bypass
 * the API client. `route` may start with a slash (the editor's `/blog/post`)
 * or not; the page tag always carries exactly one.
 */
export function pageMediaTags(route: string): string[] {
	const clean = route.replace(/^\/+/, '');
	return [`media:update:pages/${clean}`, `pages:update:/${clean}`];
}
