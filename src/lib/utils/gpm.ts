/**
 * Helpers for the GPM (Grav Package Manager) views.
 *
 * Package icons are resolved by the shared Font Awesome helper; it is
 * re-exported here so the GPM views can keep importing it from one place.
 */
export { faIconClass } from '$lib/utils/fa-icon';
import { i18n } from '$lib/stores/i18n.svelte';
import { escapeHtml } from '$lib/utils/markdown';

/**
 * Check if a package is from the Grav core team or Trilby Media (first-party).
 */
const FIRST_PARTY_AUTHORS = ['team grav', 'trilby media', 'trilby media, llc'];

export function isFirstParty(author: { name: string | null } | null | undefined): boolean {
	if (!author?.name) return false;
	return FIRST_PARTY_AUTHORS.includes(author.name.toLowerCase());
}

/**
 * Parse keywords — can be a comma-separated string or an array.
 */
export function parseKeywords(keywords: unknown): string[] {
	if (Array.isArray(keywords)) return keywords.map(String);
	if (typeof keywords === 'string') {
		return keywords.split(',').map((k) => k.trim()).filter(Boolean);
	}
	return [];
}

/**
 * Format a dependency object into a human-readable string.
 */
export interface PackageDep {
	name: string;
	version?: string;
}

/**
 * Strip HTML tags from a `description_html` value to produce plain text suitable
 * for truncated list-card display. Falls back to the raw markdown string when
 * the server hasn't provided an HTML rendering.
 */
export function descriptionText(pkg: { description?: string | null; description_html?: string | null }): string {
	if (pkg.description_html) {
		return decodeHtmlEntities(pkg.description_html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
	}
	return decodeHtmlEntities(pkg.description ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Decode HTML character entity references (e.g. `&amp;`, `&#039;`, `&nbsp;`) into
 * their plain-text characters. GPM descriptions arrive HTML-encoded, so when we
 * strip tags for a plain-text preview the raw entities would otherwise leak
 * through as literal `&#039;` text (admin2#103). Uses the browser parser when
 * available and falls back to a small named/numeric map for SSR/prerender.
 */
function decodeHtmlEntities(input: string): string {
	if (!input) return input;
	if (typeof document !== 'undefined') {
		const el = document.createElement('textarea');
		el.innerHTML = input;
		return el.value;
	}
	return input
		.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
		.replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
		.replace(/&nbsp;/g, ' ')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&');
}

/**
 * If an update operation touched the admin2 plugin (either as the target or as a
 * cascaded dependency), the SPA's bundled JS/CSS chunks have been replaced on
 * disk and the running tab will 500 on its next chunk fetch. SvelteKit's
 * version-poll catches this within ~60s, but for the click-heavy "I just
 * updated admin2" flow we trigger an immediate hard reload so the user lands
 * on the fresh bundle without waiting.
 */
export function reloadIfAdminUpdated(slugs: Iterable<string>): void {
	for (const slug of slugs) {
		if (slug === 'admin2') {
			window.location.reload();
			return;
		}
	}
}

export function parseDependencies(deps: unknown): PackageDep[] {
	if (!Array.isArray(deps)) return [];
	return deps.map((d) => {
		if (typeof d === 'string') return { name: d };
		if (d && typeof d === 'object' && 'name' in d) {
			return { name: String(d.name), version: d.version ? String(d.version) : undefined };
		}
		return { name: JSON.stringify(d) };
	});
}

/**
 * One row of the compatibility section: a label like "Grav" / "PHP" and the
 * value(s) the blueprint declares the package is compatible with. The value
 * is always rendered as a list of chips even when the underlying YAML had a
 * single string — the UI shape stays consistent that way.
 */
export interface CompatibilityRow {
	key: string;
	label: string;
	values: string[];
}

const COMPATIBILITY_LABELS: Record<string, string> = {
	grav: 'Grav',
	php: 'PHP',
	api: 'API',
};

/**
 * Normalize the `compatibility` object the API plugin emits into an ordered
 * list of rows for display. Drops empty entries. Renders well-known keys
 * (`grav`, `php`, `api`) first in a stable order; any other keys (forward-
 * compat for future blueprint extensions) are appended in their original
 * order with a title-cased label.
 */
export function parseCompatibility(compatibility: unknown): CompatibilityRow[] {
	if (!compatibility || typeof compatibility !== 'object') return [];
	const obj = compatibility as Record<string, unknown>;
	const toValues = (v: unknown): string[] => {
		if (Array.isArray(v)) return v.map(String).filter((s) => s.length > 0);
		if (typeof v === 'string' && v.length > 0) return [v];
		return [];
	};
	const labelFor = (key: string) =>
		COMPATIBILITY_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
	const knownOrder = ['grav', 'php', 'api'];
	const rows: CompatibilityRow[] = [];
	for (const key of knownOrder) {
		const values = toValues(obj[key]);
		if (values.length) rows.push({ key, label: labelFor(key), values });
	}
	for (const key of Object.keys(obj)) {
		if (knownOrder.includes(key)) continue;
		const values = toValues(obj[key]);
		if (values.length) rows.push({ key, label: labelFor(key), values });
	}
	return rows;
}

/**
 * The colour of a changelog section badge, as the Badge component draws the
 * same states elsewhere in the admin. Anything else (`#removed`, `#security`)
 * gets the neutral one.
 */
const CHANGELOG_SECTION_CLASSES: Record<string, string> = {
	new: 'bg-primary/10 text-primary',
	improved: 'bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
	bugfix: 'bg-red-600/10 text-red-700 dark:bg-red-500/15 dark:text-red-300',
};
const CHANGELOG_SECTION_NEUTRAL = 'bg-secondary text-secondary-foreground';

const CHANGELOG_SECTION_LABELS: Record<string, string> = {
	new: 'ADMIN_NEXT.CHANGELOG.NEW',
	improved: 'ADMIN_NEXT.CHANGELOG.IMPROVED',
	bugfix: 'ADMIN_NEXT.CHANGELOG.BUGFIX',
};

/**
 * Preprocess a Grav changelog into markdown that reads as one.
 *
 * Grav changelogs are written as
 *
 *     # v1.2.3
 *     ## 11/03/2026
 *
 *     1. [](#new)
 *         * item text
 *     1. [](#bugfix)
 *         * [security] item text
 *
 * The version and its date become one heading (`.changelog-version`, the date
 * in `.changelog-date`), each `[](#type)` marker a labelled badge
 * (`.changelog-badge`), the items a flat list, and a `[security]` prefix a
 * small tag (`.changelog-tag`). MarkdownModal styles those classes; the colours
 * are the admin's badge colours. The output still goes through renderMarkdown,
 * which sanitizes it, so a changelog shipped by a third-party package can't
 * carry markup through here.
 */
export function formatChangelog(raw: string): string {
	const lines = raw.replace(/\r\n?/g, '\n').split('\n');
	const out: string[] = [];
	const securityLabel = escapeHtml(i18n.t('ADMIN_NEXT.CHANGELOG.SECURITY'));

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		const version = /^#\s+(.+?)\s*$/.exec(line);
		if (version) {
			// The date is the `## mm/dd/yyyy` heading right after the version.
			let date = '';
			let j = i + 1;
			while (j < lines.length && lines[j].trim() === '') j++;
			const dateMatch = j < lines.length ? /^##\s+(.+?)\s*$/.exec(lines[j]) : null;
			if (dateMatch) {
				date = dateMatch[1];
				i = j;
			}
			out.push(
				`<h2 class="changelog-version">${escapeHtml(version[1])}` +
					(date ? ` <span class="changelog-date">${escapeHtml(date)}</span>` : '') +
					'</h2>',
				'',
			);
			continue;
		}

		const section = /^\d+\.\s*\[]\(#(\w+)\)\s*$/.exec(line);
		if (section) {
			const type = section[1].toLowerCase();
			const labelKey = CHANGELOG_SECTION_LABELS[type];
			const label = labelKey ? i18n.t(labelKey) : type;
			const classes = CHANGELOG_SECTION_CLASSES[type] ?? CHANGELOG_SECTION_NEUTRAL;
			// A blank line after it, so marked ends the HTML block before the list.
			out.push(`<span class="changelog-badge ${classes}">${escapeHtml(label)}</span>`, '');
			continue;
		}

		// Indented "* item" under a marker becomes a flat bullet.
		const item = /^(?: {2,}|\t)\* (.*)$/.exec(line);
		if (item) {
			const text = item[1].replace(
				/^\[security\]\s*/i,
				`<span class="changelog-tag">${securityLabel}</span> `,
			);
			out.push(`- ${text}`);
			continue;
		}

		out.push(line);
	}

	return out.join('\n');
}

/**
 * Where a plugin's settings actually live.
 *
 * A plugin whose admin page renders its own settings says so with
 * `settings_route`, a hash route inside that page. When it does, that is the
 * one place to edit them and `/plugins/<slug>` is a second copy of the same
 * form. A disabled plugin is the exception: its page is not running, so the
 * admin's own screen — the one with the Enable button on it — is where you go.
 *
 * `settings_page` names the plugin whose page draws them when that is not the
 * plugin itself: an add-on with no admin page of its own gets its settings
 * inside the page of the plugin it extends.
 *
 * Returns a route relative to the admin base, ready to be appended to `base`.
 */
export function pluginSettingsRoute(
	plugin:
		| { slug: string; enabled?: boolean; settings_route?: string; settings_page?: string }
		| null
		| undefined,
): string | null {
	if (!plugin || !plugin.enabled) return null;
	const route = plugin.settings_route;
	if (typeof route !== 'string' || !route.startsWith('#')) return null;
	return `/plugin/${plugin.settings_page ?? plugin.slug}${route}`;
}
