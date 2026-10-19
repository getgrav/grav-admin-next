/**
 * File names for images pasted or dropped into a page editor
 * (getgrav/grav-premium-issues#628).
 *
 * The image is uploaded to the page's media under the name chosen here, and
 * the editor inserts a markdown reference to that name. The rule:
 *
 * - An image with no real name gets `image-<8 random chars>.<ext>`, the
 *   extension taken from its MIME type. A clipboard image has no file behind
 *   it, so browsers call it `image.png`; a nameless Blob is `blob`. Those
 *   stand-ins, and a name that sanitizes down to nothing, count as no name.
 * - An image with a real name (a dropped file, or a file copied in the OS file
 *   manager and pasted) keeps it, sanitized. If the page media already has a
 *   file of that name, `-<8 random chars>` goes before the extension instead of
 *   overwriting it. The comparison ignores case, since macOS and Windows
 *   filesystems do.
 *
 * Only PNG, JPEG, GIF, WebP, AVIF and SVG are taken. The server's upload rules
 * still apply on top of this (the dangerous-extension list, SVG sanitizing),
 * so an SVG goes through only where the page media upload already allows it.
 *
 * Pure, so the rules are unit-tested (tests/paste-image-name.test.ts).
 */

/** Supported MIME type → extension written for a generated name. */
const MIME_EXTENSIONS: Readonly<Record<string, string>> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/gif': 'gif',
	'image/webp': 'webp',
	'image/avif': 'avif',
	'image/svg+xml': 'svg',
};

/** Extensions a real file name may keep as-is. */
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg']);

/** Names browsers give an image that has no file behind it. */
const STAND_IN_NAMES = new Set(['', 'image', 'blob']);

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export interface PasteImageFile {
	name: string;
	type: string;
}

/** The extension for a supported image MIME type, or null when it isn't one. */
export function pasteImageExtension(mime: string): string | null {
	return MIME_EXTENSIONS[(mime || '').toLowerCase()] ?? null;
}

/** `length` random lowercase letters and digits, from the crypto RNG. */
export function randomToken(length = 8): string {
	let out = '';
	const bytes = new Uint8Array(length * 2);
	while (out.length < length) {
		crypto.getRandomValues(bytes);
		for (const b of bytes) {
			// 252 = 7 * 36: dropping the top four values keeps every character
			// equally likely.
			if (b < 252 && out.length < length) out += ALPHABET[b % 36];
		}
	}
	return out;
}

/** Spaces and anything that isn't a letter, digit, dot, `_` or `-` become `-`. */
function sanitizeBase(base: string): string {
	return base
		.normalize('NFC')
		.replace(/[^\p{L}\p{N}._-]+/gu, '-')
		.replace(/\.{2,}/g, '.')
		.replace(/-{2,}/g, '-')
		.replace(/^[.\-_]+|[.\-_]+$/g, '');
}

/**
 * The name to upload `file` under, given the file names already in the page
 * media (`taken`), or null when the file isn't a supported image. `token`
 * supplies the random part; tests pass a fixed sequence.
 */
export function pasteImageFilename(
	file: PasteImageFile,
	taken: Iterable<string>,
	token: () => string = () => randomToken(8),
): string | null {
	const type = (file.type || '').toLowerCase();
	const mimeExt = pasteImageExtension(type);
	// A type the OS reported and we don't support is refused outright; a file
	// with no type at all is judged by its extension below.
	if (type !== '' && !mimeExt) return null;

	const raw = (file.name || '').split(/[\\/]/).pop() ?? '';
	const dot = raw.lastIndexOf('.');
	const nameExt = dot > 0 ? raw.slice(dot + 1).toLowerCase() : '';
	const hasImageExt = IMAGE_EXTENSIONS.has(nameExt);

	const ext = mimeExt ?? (hasImageExt ? nameExt : null);
	if (!ext) return null;

	const base = sanitizeBase(hasImageExt ? raw.slice(0, dot) : raw);
	const used = new Set(Array.from(taken, (n) => n.toLowerCase()));

	if (STAND_IN_NAMES.has(base.toLowerCase())) {
		return unique((t) => `image-${t}.${ext}`, used, token);
	}

	// A real name keeps its own image extension (`.jpeg` stays `.jpeg`).
	const keepExt = hasImageExt ? nameExt : ext;
	const plain = `${base}.${keepExt}`;
	if (!used.has(plain.toLowerCase())) return plain;
	return unique((t) => `${base}-${t}.${keepExt}`, used, token);
}

function unique(build: (t: string) => string, used: Set<string>, token: () => string): string {
	let name = build(token());
	// 36^8 names; a repeat means the RNG handed back a taken one, so draw again.
	for (let i = 0; i < 20 && used.has(name.toLowerCase()); i++) {
		name = build(token());
	}
	return name;
}
