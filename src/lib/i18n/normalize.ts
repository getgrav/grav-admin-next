/**
 * Canonical lang-code normalization for the admin-next UI.
 *
 * Admin2 + admin-next standardize on BCP 47 region-qualified codes (`en-US`,
 * `fr-FR`, `zh-Hans`). Older preferences blobs and any caller still using a
 * short ISO code pass through here so the in-memory locale stays canonical
 * regardless of what's on disk or in localStorage.
 *
 * Keep this map in sync with `classes/Services/LangCodes.php` in
 * grav-plugin-translation-service.
 */

/** Source / fallback admin UI lang. */
export const DEFAULT_LANG = 'en-US';

const ALIASES: Record<string, string> = {
	en: 'en-US',
	ar: 'ar-SA',
	cs: 'cs-CZ',
	de: 'de-DE',
	es: 'es-ES',
	'es-mx': 'es-MX',
	fi: 'fi-FI',
	fr: 'fr-FR',
	'fr-ca': 'fr-CA',
	he: 'he-IL',
	it: 'it-IT',
	nl: 'nl-NL',
	pt: 'pt-PT',
	ru: 'ru-RU',
	sv: 'sv-SE',
	uk: 'uk-UA',
	'zh-hans': 'zh-Hans',
	'zh-hant': 'zh-Hant',
};

/**
 * Map a raw lang code (preference value, API param, ad-hoc string) to the
 * canonical BCP 47 form used everywhere in the UI. Unknown codes are returned
 * with canonical region/script casing applied so legitimate future locales
 * (`pt-BR`, `de-CH`) pass through without an explicit alias entry.
 */
export function normalizeLang(code: string | undefined | null): string {
	if (!code) return DEFAULT_LANG;
	const key = code.trim().replace(/_/g, '-').toLowerCase();
	if (key in ALIASES) return ALIASES[key];

	// Two-part codes: re-case region subtag (UPPER) and script subtag (Title).
	const m = code.match(/^([a-z]{2,3})-([a-z0-9]{2,4})$/i);
	if (m) {
		const lang = m[1].toLowerCase();
		const tag = m[2];
		const cased = tag.length === 4
			? tag.charAt(0).toUpperCase() + tag.slice(1).toLowerCase()
			: tag.toUpperCase();
		return `${lang}-${cased}`;
	}
	return code;
}
