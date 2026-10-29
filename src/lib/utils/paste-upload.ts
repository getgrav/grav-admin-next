/**
 * Upload images pasted or dropped into a page editor to that page's media
 * (getgrav/grav-premium-issues#628).
 *
 * One path serves both editors: the built-in markdown editor calls
 * `uploadPastedImages()` directly, and plugin editors (Editor Pro) reach it as
 * `window.__GRAV_UPLOAD_PAGE_MEDIA(files)`, set up in the root layout. Each
 * resolves the images that made it, with a markdown snippet and display URL,
 * for the editor to insert. Everything else is handled here, so the editors
 * stay small: the toasts, the naming (see paste-image-name.ts), the site's
 * resize and resolution rules, the upload itself, and refreshing the page's
 * media list so the media panel shows the new file.
 *
 * The page editor registers itself as the target while it is open. With no
 * target (a markdown field in plugin config or a flex object) nothing is
 * uploaded: a toast says it only works in page content, and nothing is
 * inserted. A base64 image is never the fallback.
 */

import { toast } from 'svelte-sonner';
import { i18n } from '$lib/stores/i18n.svelte';
import { prefs } from '$lib/stores/preferences.svelte';
import { auth } from '$lib/stores/auth.svelte';
import { resolveSiteUrl } from '$lib/utils/site-url';
import { canWrite } from '$lib/utils/permissions';
import { getPageMedia, uploadPageMedia, mediaAltText, mediaMarkdown, type MediaItem } from '$lib/api/endpoints/media';
import { ApiRequestError } from '$lib/api/client';
import { applyUploadConstraints } from './imageResize';
import { pasteImageFilename } from './paste-image-name';

/** The open page editor: its route and its shared media list. */
export interface PasteUploadTarget {
	/** Structural page route, e.g. `/blog/post`. Empty or `/` until resolved. */
	readonly route: string;
	/** Replace the page's media list (what the media panel shows). */
	update(items: MediaItem[]): void;
}

/** One uploaded image, ready to insert. */
export interface PastedImage {
	/** File name in the page media, which is also the markdown destination. */
	filename: string;
	/** Absolute URL for showing the image in an editor. */
	url: string | undefined;
	/** Alt text: sidecar alt, else title, else the file name (as the media panel inserts). */
	alt: string;
	/** `![alt](filename)`, the same snippet the media panel inserts. */
	markdown: string;
}

let target: PasteUploadTarget | null = null;
let inFlight = 0;

/**
 * True while a paste upload is being sent. The upload answers with
 * `pages:update` for the page (its media changed), and the page editor would
 * take that as an edit made elsewhere: reload the page, or toast "changed
 * elsewhere" when it has unsaved edits. Its invalidation guard reads this to
 * skip the echo of its own upload.
 */
export function isPasteUploading(): boolean {
	return inFlight > 0;
}

/** Register the open page editor. Returns the matching unregister. */
export function setPasteUploadTarget(next: PasteUploadTarget): () => void {
	target = next;
	return () => {
		if (target === next) target = null;
	};
}

const KEY = 'ADMIN_NEXT.MEDIA.PASTE_UPLOAD';

function absoluteUrl(u: string | undefined): string | undefined {
	return u ? resolveSiteUrl(u, auth.serverUrl, auth.apiPrefix) : u;
}

function errorMessage(err: unknown): string {
	if (err instanceof Error && err.message) return err.message;
	return String(err ?? '');
}

/** Whether a file is one the editors should hand over (an image of any kind). */
export function isImageFile(file: File): boolean {
	return file.type.startsWith('image/') || (file.type === '' && /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(file.name));
}

/**
 * Upload `files` to the open page's media. Resolves the images that were
 * uploaded, in order; a file that fails is reported in a toast and left out.
 * Never rejects.
 */
export async function uploadPastedImages(files: File[]): Promise<PastedImage[]> {
	const list = Array.from(files ?? []).filter((f): f is File => f instanceof Blob);
	if (list.length === 0) return [];

	const page = target;
	if (!page) {
		toast.info(i18n.t(`${KEY}.PAGES_ONLY`));
		return [];
	}
	const route = page.route;
	if (!route || route === '/') {
		toast.warning(i18n.t(`${KEY}.SAVE_PAGE_FIRST`));
		return [];
	}
	if (!canWrite('media')) {
		toast.error(i18n.t(`${KEY}.NO_PERMISSION`));
		return [];
	}

	// Name against the page media as it is on the server now, not the list the
	// panel last loaded: the panel may never have mounted, and another editor
	// may have uploaded since. The upload endpoint overwrites a same-named file.
	let existing: MediaItem[];
	try {
		existing = await getPageMedia(route);
	} catch (err) {
		if (err instanceof ApiRequestError && err.status === 404) {
			toast.warning(i18n.t(`${KEY}.SAVE_PAGE_FIRST`));
		} else {
			toast.error(i18n.t(`${KEY}.FAILED`, { filename: list[0].name || 'image', message: errorMessage(err) }));
		}
		return [];
	}

	const taken = new Set(existing.map((m) => m.filename.toLowerCase()));
	const planned: Array<{ file: File; name: string }> = [];
	for (const file of list) {
		const name = pasteImageFilename(file, taken);
		if (!name) {
			toast.error(i18n.t(`${KEY}.UNSUPPORTED_TYPE`, { filename: file.name || file.type || 'file' }));
			continue;
		}
		taken.add(name.toLowerCase());
		planned.push({ file, name });
	}
	if (planned.length === 0) return [];

	const toastId = toast.loading(i18n.t(`${KEY}.UPLOADING`, { count: planned.length }));
	const uploaded: PastedImage[] = [];
	let latest: MediaItem[] | null = null;

	for (const { file, name } of planned) {
		const named = new File([file], name, { type: file.type, lastModified: file.lastModified });
		// The same resize and min/max resolution rules the media panel applies.
		const outcome = await applyUploadConstraints(named, prefs.mediaUpload);
		if (outcome.error) {
			toast.error(i18n.t(`${KEY}.FAILED`, { filename: name, message: outcome.error }));
			continue;
		}
		inFlight++;
		try {
			latest = await uploadPageMedia(route, outcome.file);
			const item: MediaItem = latest.find((m) => m.filename === name)
				?? { filename: name, type: file.type, url: '', size: outcome.file.size, modified: '' };
			uploaded.push({
				filename: item.filename,
				url: absoluteUrl(item.url),
				alt: mediaAltText(item),
				markdown: mediaMarkdown(item),
			});
		} catch (err) {
			toast.error(i18n.t(`${KEY}.FAILED`, { filename: name, message: errorMessage(err) }));
		} finally {
			inFlight--;
		}
	}

	// The upload answers with the page's whole media list. Hand it to the page
	// editor unless it has moved on to another page in the meantime.
	if (latest && target === page && page.route === route) {
		page.update(latest);
	}

	if (uploaded.length > 0) {
		toast.success(i18n.t(`${KEY}.UPLOADED`, { count: uploaded.length }), { id: toastId });
	} else {
		toast.dismiss(toastId);
	}
	return uploaded;
}
