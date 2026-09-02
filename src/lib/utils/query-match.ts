/**
 * Loose matching for the settings filter boxes.
 *
 * A field is called `order_number` in the blueprint, `Order Number` in its
 * label and `order-number` in the docs, and people type whichever one they
 * remember. Hyphens, underscores and runs of whitespace are all treated as one
 * space on both sides of the comparison, so any of the three finds the field.
 */

const SEPARATORS = /[-_\s]+/g;

/** Lower-case, with every run of separators folded to a single space. */
export function normalizeForMatch(text: string): string {
	return text.toLowerCase().replace(SEPARATORS, ' ');
}

/** True when `text` contains `query`, ignoring case and separator style. */
export function textMatches(text: string | null | undefined, query: string): boolean {
	if (!text) return false;
	const q = normalizeForMatch(query).trim();
	if (!q) return true;
	return normalizeForMatch(text).includes(q);
}

/**
 * A global, case-insensitive regex that finds `query` in raw text the same way
 * textMatches does, so a highlighter marks exactly what the filter matched.
 * Null when the query is empty.
 */
export function queryRegex(query: string): RegExp | null {
	const parts = query
		.split(SEPARATORS)
		.filter(Boolean)
		.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
	if (parts.length === 0) return null;
	return new RegExp(`(${parts.join('[-_\\s]+')})`, 'gi');
}
