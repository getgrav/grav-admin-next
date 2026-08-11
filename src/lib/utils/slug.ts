import getSlug from 'speakingurl';

/**
 * Turn a page title into a folder name.
 *
 * Grav 1.7's classic admin ran the title through `speakingurl` before writing it
 * into the folder field, so titles in Cyrillic, Greek, Arabic or accented Latin
 * came out transliterated: "Просто страница test" became "prosto-stranica-test".
 * Admin-next shipped with a plain `[^a-z0-9]` filter instead, which has no `u`
 * flag and an ASCII-only character class, so it deleted every non-Latin letter
 * outright and left just "test" (getgrav/grav-plugin-admin2#157).
 *
 * `lang` only selects which word symbols expand to ("&" becomes "and" / "и" /
 * "und"); the transliteration tables are always active. Classic read it off
 * `<html lang>`, so callers pass the admin UI locale for parity.
 */
export function slugify(str: string, lang?: string): string {
	const input = (str ?? '').toString();

	const slug = getSlug(input, {
		lang: lang || 'en',
		custom: { "'": '', '‘': '', '’': '' }
	});

	// speakingurl carries no table for Han or kana, so a title written entirely
	// in Chinese or Japanese transliterates to an empty string. That left the
	// folder field blank and, because the new-page form requires a non-empty
	// slug, the Save button permanently disabled with no explanation. Grav
	// routes are UTF-8 safe (core's Inflector::hyphenize keeps \p{L} too), so
	// fall back to a Unicode-preserving slug rather than to nothing at all.
	return slug || unicodeSlug(input);
}

/** Hyphenated slug that keeps Unicode letters and digits. Mirrors core's Inflector::hyphenize(). */
function unicodeSlug(str: string): string {
	return str
		.toLowerCase()
		.replace(/['‘’]/g, '')
		.replace(/[^\p{L}\p{N}]+/gu, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
}

/**
 * Constrain what a user can type directly into a folder field.
 *
 * Deliberately excludes `.` so a folder name can never start with one — Grav
 * reads a leading dot as an ordering-prefix artefact and the resulting route
 * 404s. Unicode letters and digits are allowed through so a manually typed
 * Chinese or Cyrillic folder name survives, which is what makes the CJK
 * fallback above usable.
 */
export function sanitizeSlugInput(value: string): string {
	return value
		.toLowerCase()
		.replace(/\s+/g, '-')
		.replace(/[^\p{L}\p{N}_-]/gu, '');
}
