import { api } from '$lib/api/client';
import { i18n } from '$lib/stores/i18n.svelte';

/**
 * A way to undo a page delete, attached by a plugin (Revisions Pro's trash,
 * for one) to the API's `onApiPageDeleted` event. The delete then answers
 * with `{ undo }` instead of an empty 204. `endpoint` is relative to the API
 * prefix; the API has already checked it is a path, not a URL.
 */
export interface PageDeleteUndo {
	method: string;
	endpoint: string;
	body?: Record<string, unknown>;
	label?: string;
}

/** What a page delete answers: an undo, when a plugin offers one. */
export interface PageDeleteResult {
	undo?: PageDeleteUndo;
}

/** The undo a delete response carries, or null. */
export function deleteUndo(result: PageDeleteResult | undefined | null): PageDeleteUndo | null {
	const undo = result?.undo;
	if (!undo || typeof undo.endpoint !== 'string' || !undo.endpoint.startsWith('/') || undo.endpoint.startsWith('//')) {
		return null;
	}
	return undo;
}

/**
 * Make the undo call. Resolves the endpoint's `data` (a restore usually
 * names the page it brought back as `route`).
 */
export async function runDeleteUndo(undo: PageDeleteUndo): Promise<{ route?: string } | undefined> {
	const method = (undo.method || 'POST').toUpperCase();
	switch (method) {
		case 'GET':
			return api.get(undo.endpoint);
		case 'PUT':
			return api.put(undo.endpoint, undo.body);
		case 'PATCH':
			return api.patch(undo.endpoint, undo.body);
		case 'DELETE':
			return api.delete(undo.endpoint, undo.body);
		default:
			return api.post(undo.endpoint, undo.body);
	}
}

/**
 * A content language's name in the admin's own language: `de-de` reads
 * "German (Germany)" in an English admin, "Deutsch (Deutschland)" in a
 * German one. Falls back to the site's own label for a code the browser
 * can't name.
 */
export function displayLanguageName(code: string, fallback: (code: string) => string): string {
	try {
		const tag = code.replace(/[-_]([a-z]{2})$/i, (_, region: string) => '-' + region.toUpperCase());
		const name = new Intl.DisplayNames([i18n.lang || 'en'], { type: 'language' }).of(tag);
		if (name && name.toLowerCase() !== code.toLowerCase() && name.toLowerCase() !== tag.toLowerCase()) return name;
	} catch {
		// Not a code Intl knows
	}
	return fallback(code);
}

/**
 * The wording of a page delete confirmation.
 *
 * On a multi-language site deleting one language says which one, and that
 * the others stay; deleting the page's last language warns that the whole
 * folder goes, media and child pages with it. A single-language site keeps
 * the plain "Delete … at …?". The last sentence says the page can be
 * restored from the trash when a plugin keeps deleted pages
 * (`delete_recoverable`), and that it can't be undone otherwise.
 */
export function pageDeleteText(options: {
	title: string;
	route: string;
	/** The language being deleted, on a multi-language site. */
	lang?: string | null;
	/** Languages the page has a file for. */
	languages?: string[] | null;
	recoverable?: boolean;
	languageName: (code: string) => string;
}): { title: string; message: string } {
	const { title, route, lang, recoverable, languageName } = options;
	const languages = (options.languages ?? []).filter(Boolean);
	const tail = recoverable
		? i18n.t('ADMIN_NEXT.PAGES.DELETE_RECOVERABLE')
		: i18n.t('ADMIN_NEXT.PAGES.DELETE_CANNOT_UNDO');

	if (lang && languages.length > 1 && languages.includes(lang)) {
		return {
			title: i18n.t('ADMIN_NEXT.PAGES.DELETE_TRANSLATION_TITLE'),
			message: `${i18n.t('ADMIN_NEXT.PAGES.DELETE_TRANSLATION_CONFIRM', {
				language: displayLanguageName(lang, languageName),
				title,
				n: languages.length - 1,
			})} ${tail}`,
		};
	}

	const base = i18n.t('ADMIN_NEXT.CONFIRM_DELETE', { title, route });
	if (lang && languages.length === 1) {
		return {
			title: i18n.t('ADMIN_NEXT.PAGES.DELETE_PAGE'),
			message: `${base} ${i18n.t('ADMIN_NEXT.PAGES.DELETE_LAST_LANGUAGE')} ${tail}`,
		};
	}

	return { title: i18n.t('ADMIN_NEXT.PAGES.DELETE_PAGE'), message: `${base} ${tail}` };
}
