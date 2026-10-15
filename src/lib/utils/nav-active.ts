/**
 * Active-route matching for navigation links (sidebar, tab bars).
 *
 * Matches on whole path segments: `/plugin/foo` is active on `/plugin/foo`
 * and `/plugin/foo/anything`, but not on `/plugin/foo-bar` (admin2#195).
 * Trailing slashes and hashes on `href` are ignored. Query parameters on
 * `href` must also be present in `search` with the same values, so links to
 * one plugin page that differ only by `?view=` light up one at a time
 * (admin2#196). The admin root (`base`) only matches itself, otherwise the
 * Dashboard link would be active on every page.
 *
 * Pure (takes `base` instead of importing `$app/paths`) so it can be unit tested.
 */
export function isActiveRoute(pathname: string, href: string, base: string, search = ''): boolean {
	const target = trimPath(href);
	const path = trimPath(pathname);
	if (target === trimPath(base)) return path === target;
	if (path !== target && !path.startsWith(target + '/')) return false;

	const want = new URLSearchParams(href.split('#')[0].split('?')[1] ?? '');
	const have = new URLSearchParams(search);
	for (const [key, value] of want) {
		if (have.get(key) !== value) return false;
	}
	return true;
}

function trimPath(value: string): string {
	return value.split(/[?#]/)[0].replace(/\/+$/, '');
}
