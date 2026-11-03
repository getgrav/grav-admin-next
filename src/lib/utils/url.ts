/**
 * Bare hostname of a URL for display — drops the protocol and a leading `www.`.
 * Falls back to a best-effort strip if the value isn't a parseable URL, so a
 * malformed blueprint `homepage` still renders as readable text rather than the
 * raw string with its protocol.
 */
export function hostname(url: string | null | undefined): string {
	const value = (url ?? '').trim();
	if (!value) return '';
	try {
		return new URL(value).hostname.replace(/^www\./, '');
	} catch {
		return value.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
	}
}

/**
 * The value as an absolute http(s) URL, or null when it is anything else.
 *
 * For links whose target comes from outside the admin, such as a package's
 * `homepage` from its blueprint or the GPM feed. Svelte does not filter `href`,
 * so a `javascript:` or `data:` value would otherwise become a live link. Takes
 * `unknown` because such values pass through the API untyped: YAML can hand over
 * `false`, a number or a map, and those count as no URL.
 */
export function webUrl(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	try {
		const url = new URL(value.trim());
		return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
	} catch {
		return null;
	}
}

/**
 * A link target for a value that is either an absolute http(s) address or a
 * path on this site, or null for anything else (javascript:, data: and so on),
 * so the value renders as inert text instead.
 *
 * A path is resolved against `origin` and has to stay on it: browsers read
 * `//host` and `/\host` as another host, so a value that looks like a path
 * could otherwise leave the site. `origin` is a `location.origin` value.
 */
export function safeHref(value: unknown, origin: string = window.location.origin): string | null {
	const address = webUrl(value);
	if (address !== null || typeof value !== 'string' || value.trim() === '') return address;
	try {
		const url = new URL(value.trim(), origin);
		return url.origin === origin ? url.href : null;
	} catch {
		return null;
	}
}

/** Normalized form for comparing two URLs for equality (protocol/case/trailing-slash insensitive). */
export function sameUrl(a: string | null | undefined, b: string | null | undefined): boolean {
	const norm = (u: string | null | undefined) =>
		(u ?? '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase();
	const na = norm(a);
	return na !== '' && na === norm(b);
}
