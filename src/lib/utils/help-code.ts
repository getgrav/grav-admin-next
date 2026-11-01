/**
 * Draw markdown code spans in field help as `<code>`.
 *
 * Help is HTML, but much of it was written for admin-classic, which showed it
 * as plain text in a tooltip, and wraps names in backticks the way markdown
 * does: "Absolute or relative URLs for `base_url`" (admin2#207). Only code
 * spans are converted. Help also uses `*`, `_`, `~` and `>` as ordinary
 * characters ("wildcards (*)", "Paddle > Developer tools"), which a full
 * markdown pass would misread.
 *
 * The text inside a span is code, so `<` and `>` in it are escaped (Grav's
 * `<template>.<extension>.twig` stays text instead of becoming an element).
 * Entities such as `&nbsp;` are kept. Backticks inside an HTML tag are left
 * alone. The result still goes through `sanitizeHtml`.
 */
export function helpCodeSpans(text: string): string {
	if (!text.includes('`')) return text;
	return text.replace(/(<[^>]*>)|`([^`\n]+)`/g, (match: string, tag: string | undefined, code: string | undefined) => {
		if (tag !== undefined || code === undefined) return match;
		return `<code>${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>`;
	});
}
