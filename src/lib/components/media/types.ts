import type { MediaItem } from '$lib/api/endpoints/media';

/**
 * Shared reactive context for page media items.
 * Set by the page editor, read by FilePickerField, written by PageMedia.
 */
export interface PageMediaContext {
	readonly items: MediaItem[];
	update(items: MediaItem[]): void;
}
