import type { MediaItem } from '$lib/api/endpoints/media';

/**
 * Shared `accept` matching for media/file fields.
 *
 * Blueprint `accept` lists mix three notations, exactly as admin-classic's
 * filepicker and the HTML file input do:
 *   - `image/*`  — a mime glob
 *   - `.pdf`     — a filename extension
 *   - `image/png`— an exact mime type
 *
 * An empty/absent list accepts everything.
 */
export function matchesAccept(item: MediaItem, accept?: string[]): boolean {
	if (!accept || accept.length === 0) return true;

	const filename = item.filename.toLowerCase();
	const mime = item.type.toLowerCase();

	return accept.some((pattern) => {
		const p = pattern.toLowerCase().trim();
		if (!p) return false;
		if (p.includes('*')) return mime.startsWith(p.replace('*', ''));
		if (p.startsWith('.')) return filename.endsWith(p);
		return mime === p;
	});
}

/**
 * Coarse `type` value for `GET /media`, derived from an `accept` list.
 *
 * The site-media endpoint filters into four buckets (image/video/audio/document)
 * *before* paginating, so narrowing there keeps a large library from paging out
 * the files a field actually wants. It is only a pre-filter — callers still run
 * {@link matchesAccept} on the result for extension-level precision.
 *
 * Returns undefined when the list spans more than one bucket (or none), which
 * leaves the endpoint unfiltered.
 */
export function siteMediaTypeFilter(accept?: string[]): string | undefined {
	if (!accept || accept.length === 0) return undefined;

	const buckets = new Set(
		accept.map((pattern) => {
			const p = pattern.toLowerCase().trim();
			if (p.startsWith('image/')) return 'image';
			if (p.startsWith('video/')) return 'video';
			if (p.startsWith('audio/')) return 'audio';
			// Extensions and anything else can't be mapped to a bucket without a
			// mime table the server already owns — leave those unfiltered.
			return '';
		}),
	);

	if (buckets.size !== 1) return undefined;
	const only = [...buckets][0];
	return only === '' ? undefined : only;
}
