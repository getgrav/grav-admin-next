/**
 * Helpers for the GPM (Grav Package Manager) views.
 *
 * Package icons are resolved by the shared Font Awesome helper; it is
 * re-exported here so the GPM views can keep importing it from one place.
 */
export { faIconClass } from '$lib/utils/fa-icon';

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
 * Preprocess Grav changelog markdown into clean HTML-friendly markdown.
 *
 * Grav changelogs use a special format:
 *   1. [](#bugfix)      →  badge
 *   1. [](#new)         →  badge
 *   1. [](#improved)    →  badge
 *       * item text     →  bullet item
 */
export function formatChangelog(raw: string): string {
	const badgeColors: Record<string, string> = {
		new: 'background:#2563eb;color:white',
		improved: 'background:#f59e0b;color:white',
		bugfix: 'background:#ef4444;color:white',
	};
	const badgeLabels: Record<string, string> = {
		new: 'New',
		improved: 'Improved',
		bugfix: 'Bugfix',
	};

	return raw
		// Replace "1. [](#type)" lines with badge HTML
		.replace(/^\d+\.\s*\[]\(#(\w+)\)\s*$/gm, (_match, type: string) => {
			const color = badgeColors[type] ?? 'background:#6b7280;color:white';
			const label = badgeLabels[type] ?? type;
			return `<span style="${color};padding:2px 8px;border-radius:4px;font-size:0.6875rem;font-weight:600;display:inline-block;margin-top:8px">${label}</span>\n`;
		})
		// Convert indented "* item" to flat bullets (remove extra nesting)
		.replace(/^ {4}\* /gm, '- ')
		.replace(/^\t\* /gm, '- ');
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
