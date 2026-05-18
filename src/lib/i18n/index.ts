/**
 * Local translation registry for admin-next UI strings.
 *
 * To add a new language:
 * 1. Create src/lib/i18n/{BCP47-code}.ts (copy en-US.ts as a starting point)
 * 2. Add the import and registry entry below (keyed by canonical BCP 47 code)
 *
 * Local strings are merged into the i18n store alongside API translations.
 * They use the ADMIN_NEXT.* prefix and take precedence over API strings
 * with the same key.
 */

import enUS from './en-US';
import { DEFAULT_LANG, normalizeLang } from './normalize';

const localTranslations: Record<string, Record<string, string>> = {
	'en-US': enUS,
};

/**
 * Get local translations for a given language. Falls back to the source lang
 * if the requested language isn't registered. Incoming codes are normalized
 * so legacy callers passing `'en'` still resolve to `'en-US'`.
 */
export function getLocalStrings(lang: string): Record<string, string> {
	const canonical = normalizeLang(lang);
	return localTranslations[canonical] ?? localTranslations[DEFAULT_LANG] ?? {};
}

/** List of languages that have local translations */
export const availableLocalLanguages = Object.keys(localTranslations);

export { DEFAULT_LANG, normalizeLang };
