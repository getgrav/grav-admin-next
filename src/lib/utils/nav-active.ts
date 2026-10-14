/**
 * Active-route matching for navigation links (sidebar, tab bars).
 *
 * Matches on whole path segments: `/plugin/foo` is active on `/plugin/foo`
 * and `/plugin/foo/anything`, but not on `/plugin/foo-bar` (admin2#195).
 * Trailing slashes, query strings and hashes on `href` are ignored. The admin
 * root (`base`) only matches itself, otherwise the Dashboard link would be
 * active on every page.
 *
 * Pure (takes `base` instead of importing `$app/paths`) so it can be unit tested.
 */
export function isActiveRoute(pathname: string, href: string, base: string): boolean {
	const target = trimPath(href);
	const path = trimPath(pathname);
	if (target === trimPath(base)) return path === target;
	return path === target || path.startsWith(target + '/');
}

function trimPath(value: string): string {
	return value.split(/[?#]/)[0].replace(/\/+$/, '');
}
