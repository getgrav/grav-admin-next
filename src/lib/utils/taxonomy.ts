/**
 * Helpers for the page editor's Taxonomy field. Kept free of Svelte and of the
 * API client so they can be tested on their own (tests/taxonomy.test.ts).
 */

export interface TaxonomyOption {
	value: string;
	label: string;
}

/** Strings and numbers are taxonomy values; anything else (null, nested maps) is not. */
function toStrings(list: unknown[]): string[] {
	return list
		.filter((v) => typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v)))
		.map(String);
}

/**
 * One taxonomy type's values as a list of strings, whichever way the
 * frontmatter wrote them: a list (`tag: [a, b]`), a single value
 * (`category: blog`), a comma list (`tag: a, b`) or a bare number
 * (`category: 2024`).
 */
export function taxonomyValues(raw: unknown): string[] {
	if (Array.isArray(raw)) return toStrings(raw);
	if (typeof raw === 'string') return raw.split(',').map((s) => s.trim()).filter(Boolean);
	if (typeof raw === 'number' && Number.isFinite(raw)) return [String(raw)];
	return [];
}

/** A page's `taxonomy` frontmatter as type => list of strings, for display. */
export function parseTaxonomy(value: unknown): Record<string, string[]> {
	const result: Record<string, string[]> = {};
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		for (const [type, raw] of Object.entries(value as Record<string, unknown>)) {
			result[type] = taxonomyValues(raw);
		}
	}
	return result;
}

/**
 * The `GET /taxonomy` reply as type => list of strings.
 *
 * The API builds each list from PHP array keys, and PHP turns a key that looks
 * like an integer ("2024") into an int, so a site with a year tag received
 * `["news", 2023, 2024]`. Sorting that list threw while the field was being
 * drawn, which left its loading placeholder on screen for good
 * (getgrav/grav-plugin-admin2#186). Nothing past this point sees a non-string,
 * whatever API version answers. An empty map arrives as `[]`, also from PHP.
 */
export function normalizeTaxonomyMap(data: unknown): Record<string, string[]> {
	const result: Record<string, string[]> = {};
	if (!data || typeof data !== 'object' || Array.isArray(data)) return result;

	for (const [type, raw] of Object.entries(data as Record<string, unknown>)) {
		const list = Array.isArray(raw)
			? raw
			: raw && typeof raw === 'object'
				? Object.values(raw as Record<string, unknown>)
				: [];
		result[type] = [...new Set(toStrings(list).filter(Boolean))];
	}
	return result;
}

/** Suggestions for one type, alphabetical so existing tags are easy to scan (admin2#180). */
export function taxonomyOptions(values: string[]): TaxonomyOption[] {
	return [...values]
		.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
		.map((v) => ({ value: v, label: v }));
}

/**
 * The page's taxonomy with one type replaced by the edited tag list.
 *
 * Only the edited type changes. The others go back exactly as the author
 * wrote them (`category: blog` stays a single value), so editing tags does not
 * rewrite the rest of the block, and undoing the edit compares equal to the
 * original again.
 *
 * A cleared type is sent as an explicit empty list so the server's list-aware
 * merge overwrites the stored values; leaving it out was read as "unchanged"
 * and the old value came back (admin2#140).
 */
export function withTaxonomyType(value: unknown, type: string, tags: unknown): Record<string, unknown> {
	const current =
		value && typeof value === 'object' && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: {};
	return { ...current, [type]: Array.isArray(tags) ? toStrings(tags).filter(Boolean) : [] };
}
