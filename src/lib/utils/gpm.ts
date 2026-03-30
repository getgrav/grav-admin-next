/**
 * Resolve a Grav plugin icon name to FA6 CSS classes.
 *
 * Grav plugins store icons as bare names (e.g. "empire", "plug", "envelope").
 * FA6 requires a family prefix: fa-solid, fa-regular, or fa-brands.
 * We try fa-solid first (most common), with fa-brands as fallback for
 * brand icons like "empire", "github", "wordpress", etc.
 */
const FA_BRAND_ICONS = new Set([
	'empire', 'rebel', 'github', 'twitter', 'facebook', 'google', 'wordpress',
	'apple', 'android', 'linux', 'windows', 'chrome', 'firefox', 'safari',
	'edge', 'opera', 'internet-explorer', 'docker', 'aws', 'node-js', 'npm',
	'python', 'php', 'js', 'java', 'laravel', 'symfony', 'drupal', 'joomla',
	'magento', 'shopify', 'stripe', 'paypal', 'bitcoin', 'ethereum',
	'slack', 'discord', 'telegram', 'whatsapp', 'youtube', 'twitch',
	'instagram', 'linkedin', 'pinterest', 'reddit', 'stack-overflow',
	'gitlab', 'bitbucket', 'digital-ocean', 'cloudflare', 'font-awesome',
]);

export function faIconClass(icon: string): string {
	if (!icon) return '';
	const name = icon.replace(/^fa-/, '');
	const family = FA_BRAND_ICONS.has(name) ? 'fa-brands' : 'fa-solid';
	return `${family} fa-${name}`;
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
