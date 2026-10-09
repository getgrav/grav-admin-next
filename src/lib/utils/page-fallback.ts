/**
 * What the page editor is looking at when a content language is active.
 *
 *  - `none`: the page came back in the active language (or the site has one
 *    language). Save writes that file.
 *  - `creatable`: the page came back in another language and the server lists
 *    the active one as not translated yet. Save turns into "Save as <language>"
 *    and creates the translation.
 *  - `unresolved`: the page came back in another language, yet the server did
 *    not list the active one as missing. Either it never saw `?lang=` and
 *    `?translations=true` (a web server that drops the query string before PHP,
 *    getgrav/grav#4338), or it resolved the page to the wrong file. There is no
 *    translation to create, and a plain save would land in whichever file the
 *    server picks, so the editor explains that and keeps Save off.
 */
export type PageFallbackState = 'none' | 'creatable' | 'unresolved';

export interface PageFallbackInput {
	/** Multi-language is on for the site. */
	enabled: boolean;
	/** The content language the editor is set to. */
	activeLang: string;
	/** The site's default language. */
	defaultLang: string;
	/** The loaded page, or null while nothing is loaded. */
	page: { language?: string | null; untranslated_languages?: string[] } | null;
}

/** The language of the file the server returned. A bare `default.md` has none, so it counts as the default language. */
export function effectivePageLang(page: PageFallbackInput['page'], defaultLang: string): string {
	return page?.language || defaultLang;
}

export function pageFallbackState({ enabled, activeLang, defaultLang, page }: PageFallbackInput): PageFallbackState {
	if (!enabled || page === null) return 'none';
	if (effectivePageLang(page, defaultLang) === activeLang) return 'none';

	return page.untranslated_languages?.includes(activeLang) ? 'creatable' : 'unresolved';
}

/**
 * Whether a page row has a file in `lang`. The list answers in the active
 * language even for a page that only exists in another one (the server falls
 * back), so the actions that change or delete one language's file must be off
 * for such a row. A row without translation info (single-language site, older
 * API) counts as having it.
 */
export function pageHasLang(
	page: { translated_languages?: Record<string, string>; has_default_file?: boolean },
	lang: string | undefined,
	defaultLang: string,
): boolean {
	if (!lang) return true;
	const keys = page.translated_languages ? Object.keys(page.translated_languages) : [];
	const implicitDefault = !!page.has_default_file && !!defaultLang;
	if (keys.length === 0 && !implicitDefault) return true;
	return keys.includes(lang) || (implicitDefault && lang === defaultLang);
}
