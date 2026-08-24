import { marked, type Renderer } from 'marked';
import DOMPurify from 'dompurify';

/**
 * The single place markdown becomes HTML for `{@html …}`.
 *
 * `marked` does not sanitize anything — it emits `javascript:` hrefs as live links
 * and passes raw HTML (`<img onerror=…>`, `<svg onload=…>`) straight through. Much of
 * what we render is authored by someone other than the person looking at it: page
 * bodies written by editors, CHANGELOG.md shipped by third-party packages, blueprint
 * descriptions from installed plugins. So every marked call goes through DOMPurify
 * here rather than at the call site, and no component imports `marked` directly
 * (GHSA-752r-88j4-vxm3).
 *
 * DOMPurify's defaults are what we want: only http(s)/mailto/tel-class schemes survive
 * in href/src, event-handler attributes are dropped, and `style` is kept but
 * CSS-sanitized (the changelog badges in utils/gpm.ts rely on that).
 */

function clean(html: string): string {
	return DOMPurify.sanitize(html);
}

/**
 * Sanitize a string that is already HTML, with no markdown pass.
 *
 * Blueprint `description` and `help` are authored as HTML by whoever ships the
 * blueprint — admin-classic renders both with `|raw` in forms/field.html.twig —
 * so escaping them turns documented markup into visible tag soup. They still go
 * through DOMPurify for the same reason everything else here does: a blueprint
 * can arrive from a third-party package (GHSA-752r-88j4-vxm3).
 */
export function sanitizeHtml(html: string | null | undefined): string {
	if (!html) return '';

	return clean(html);
}

/** Render a markdown document as block-level HTML, sanitized. */
export function renderMarkdown(text: string | null | undefined): string {
	if (!text) return '';
	return clean(marked.parse(text, { async: false }) as string);
}

/**
 * Render a short string as inline HTML (no surrounding `<p>`), sanitized.
 * `renderer` lets callers customize link output — it does not affect safety.
 */
export function renderMarkdownInline(
	text: string | null | undefined,
	renderer?: Renderer
): string {
	if (!text) return '';
	return clean(marked.parseInline(text, { async: false, renderer }) as string);
}

/**
 * Neutralise one untrusted value before it is substituted into a `tHtml()` template.
 *
 * The template is developer-authored and is meant to carry markdown; the values
 * substituted into it are not — they are usernames, display names, media paths and URL
 * query values. Escaping the HTML metacharacters is necessary but not sufficient:
 * `marked` does not escape raw HTML, and it would still read `[x](javascript:…)` inside
 * a value as link syntax, so the inline markdown punctuation is backslash-escaped too
 * (GHSA-96xm-c5hr-59rx).
 */
export function escapeMarkdownParam(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;')
		.replace(/[\\`*_[\]()~!]/g, '\\$&');
}
