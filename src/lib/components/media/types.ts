import type { MediaItem } from '$lib/api/endpoints/media';

/**
 * Shared reactive context for page media items.
 * Set by the page editor, read by FilePickerField, written by PageMedia.
 */
export interface PageMediaContext {
	readonly items: MediaItem[];
	update(items: MediaItem[]): void;
}

/**
 * Where blueprint media/file fields read, write, and delete attached media.
 * Set by the host edit route — the flex-object editor points it at the
 * flex-object media endpoints — and read by PageMedia, PageMediaField, and
 * FileField. When no source is provided the fields fall back to the legacy
 * page-media path derived from the `pageRoute` context.
 *
 * `apiBase` is the relative API path with no leading slash and no trailing
 * `/media` segment, e.g. `flex-objects/contacts/abc123`. `null` means the
 * source is not resolved yet (e.g. a not-yet-saved object) and requests
 * should be skipped.
 *
 * `invalidationKeys` are the channels to emit after an upload/delete so other
 * views refresh — XHR uploads bypass the API client's automatic invalidation.
 */
export interface MediaSource {
	apiBase: string | null;
	invalidationKeys: string[];
}
