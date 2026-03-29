/**
 * Local translation registry for admin-next UI strings.
 *
 * To add a new language:
 * 1. Create src/lib/i18n/{lang}.ts (copy en.ts as a starting point)
 * 2. Add the import and registry entry below
 *
 * Local strings are merged into the i18n store alongside API translations.
 * They use the ADMIN_NEXT.* prefix and take precedence over API strings
 * with the same key.
 */

import en from './en';

const localTranslations: Record<string, Record<string, string>> = {
	en,
};

/**
 * Get local translations for a given language.
 * Falls back to English if the language isn't available.
 */
export function getLocalStrings(lang: string): Record<string, string> {
	return localTranslations[lang] ?? localTranslations['en'] ?? {};
}

/** List of languages that have local translations */
export const availableLocalLanguages = Object.keys(localTranslations);
