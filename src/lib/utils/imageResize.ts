/**
 * On-device image resizing for media uploads.
 *
 * Classic admin shrinks oversized images in the browser before they are sent,
 * via Dropzone's `resizeWidth`/`resizeHeight`/`resizeQuality` options wired to
 * the `pagemedia` config. Admin-next uploads through Uppy, which has no
 * equivalent built in, so the same behaviour lives here and is applied as an
 * Uppy pre-processor.
 *
 * This is a convenience, not a policy: it saves bandwidth and keeps a Git Sync
 * repo from filling up with 6000px phone photos. It is trivially bypassed by
 * anything that is not this browser, so it is not a substitute for a
 * server-side constraint.
 */

import type { MediaUploadSettings } from '$lib/api/endpoints/preferences';

/** Formats we re-encode. GIF is excluded: a canvas round-trip keeps one frame
 *  and would silently throw away the animation. WebP is excluded for the same
 *  reason, since an animated WebP is indistinguishable by MIME type alone. */
const RESIZABLE = new Set(['image/jpeg', 'image/png']);

/** Refuse to decode anything whose pixel count would blow up in memory. A
 *  canvas holds 4 bytes per pixel, so 50M pixels is already 200MB. */
const MAX_DECODE_PIXELS = 50_000_000;

export interface ResizeOutcome {
	/** The file to upload: the resized copy, or the original when untouched. */
	file: File;
	/** True when the image was actually re-encoded. */
	resized: boolean;
	/** Set when the image must not be uploaded at all. */
	error?: string;
}

export function hasResizeConstraints(s: MediaUploadSettings | null | undefined): boolean {
	if (!s) return false;
	return (
		s.resizeWidth > 0 ||
		s.resizeHeight > 0 ||
		s.minWidth > 0 ||
		s.minHeight > 0 ||
		s.maxWidth > 0 ||
		s.maxHeight > 0
	);
}

/** Decode with the EXIF orientation already applied, so the dimensions we cap
 *  are those of the upright image rather than a phone photo lying on its side. */
async function decode(file: File): Promise<ImageBitmap> {
	return createImageBitmap(file, { imageOrientation: 'from-image' });
}

/**
 * Work out the target box. Matches Dropzone's `contain` behaviour: the image
 * fits inside the box, aspect ratio preserved, and it is never upscaled.
 */
function fitWithin(
	width: number,
	height: number,
	maxWidth: number,
	maxHeight: number,
): { width: number; height: number } | null {
	const wRatio = maxWidth > 0 ? maxWidth / width : Infinity;
	const hRatio = maxHeight > 0 ? maxHeight / height : Infinity;
	const ratio = Math.min(wRatio, hRatio);
	if (!Number.isFinite(ratio) || ratio >= 1) return null;
	return {
		width: Math.max(1, Math.round(width * ratio)),
		height: Math.max(1, Math.round(height * ratio)),
	};
}

/**
 * Apply the configured constraints to one file.
 *
 * Never throws and never rejects an upload because the resize itself failed:
 * a file that passed validation is uploaded as-is if the browser cannot
 * re-encode it. Only an explicit min/max resolution rule produces an `error`.
 */
export async function applyUploadConstraints(
	file: File,
	settings: MediaUploadSettings | null | undefined,
): Promise<ResizeOutcome> {
	if (!settings || !hasResizeConstraints(settings) || !file.type.startsWith('image/')) {
		return { file, resized: false };
	}

	let bitmap: ImageBitmap;
	try {
		bitmap = await decode(file);
	} catch {
		// Not decodable here (SVG, a format this browser lacks, a corrupt file).
		// Let the server have it; it does its own validation.
		return { file, resized: false };
	}

	try {
		const { width, height } = bitmap;

		if (settings.minWidth > 0 && width < settings.minWidth) {
			return { file, resized: false, error: `Image is ${width}px wide; the minimum is ${settings.minWidth}px.` };
		}
		if (settings.minHeight > 0 && height < settings.minHeight) {
			return { file, resized: false, error: `Image is ${height}px tall; the minimum is ${settings.minHeight}px.` };
		}

		const wantsResize = settings.resizeWidth > 0 || settings.resizeHeight > 0;

		// Max resolution only rejects when we have no resize to fall back on.
		// With one configured we shrink instead, which is what classic admin does.
		if (!wantsResize) {
			if (settings.maxWidth > 0 && width > settings.maxWidth) {
				return { file, resized: false, error: `Image is ${width}px wide; the maximum is ${settings.maxWidth}px.` };
			}
			if (settings.maxHeight > 0 && height > settings.maxHeight) {
				return { file, resized: false, error: `Image is ${height}px tall; the maximum is ${settings.maxHeight}px.` };
			}
			return { file, resized: false };
		}

		if (!RESIZABLE.has(file.type)) return { file, resized: false };
		if (width * height > MAX_DECODE_PIXELS) return { file, resized: false };

		const target = fitWithin(width, height, settings.resizeWidth, settings.resizeHeight);
		if (!target) return { file, resized: false };

		const canvas = document.createElement('canvas');
		canvas.width = target.width;
		canvas.height = target.height;
		const ctx = canvas.getContext('2d');
		if (!ctx) return { file, resized: false };
		ctx.drawImage(bitmap, 0, 0, target.width, target.height);

		// PNG ignores the quality argument and stays lossless.
		const quality = file.type === 'image/png' ? undefined : settings.resizeQuality;
		const blob = await new Promise<Blob | null>((resolve) => {
			canvas.toBlob(resolve, file.type, quality);
		});
		if (!blob) return { file, resized: false };

		// A re-encode can come out larger than the original (already-optimised
		// JPEGs do this). Keep whichever is smaller.
		if (blob.size >= file.size) return { file, resized: false };

		return {
			file: new File([blob], file.name, { type: file.type, lastModified: file.lastModified }),
			resized: true,
		};
	} catch {
		return { file, resized: false };
	} finally {
		bitmap.close?.();
	}
}
