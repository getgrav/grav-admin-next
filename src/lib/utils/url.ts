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

/** The trimmed text of a value, or '' when it isn't text. */
function text(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

/** `address` as an absolute http(s) URL, or null when it is anything else. */
function httpUrl(address: string): string | null {
	try {
		const url = new URL(address);
		return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
	} catch {
		return null;
	}
}

/**
 * A host name with a top-level domain, then a path, query, fragment or nothing:
 * `github.com/getgrav/grav-plugin-admin`, `getgrav.org`, `bücher.de`,
 * `shop.xn--p1ai`. Captures the top-level domain. No port: whether the server
 * there speaks https can't be told. A scheme (`javascript:`) or credentials
 * (`user@host`) never match.
 */
const BARE_HOST = /^(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?\.)+(\p{L}{2,}|xn--[a-z0-9-]+)(?:[/?#]|$)/iu;

/**
 * Endings that make a lone name a file rather than a host: `README.md`,
 * `CHANGELOG.md` and `docs.html` are files next to the package, not the
 * readme.md, changelog.md or docs.html domains.
 */
const FILE_ENDINGS = new Set([
	'md', 'markdown', 'txt', 'html', 'htm', 'php', 'json', 'yaml', 'yml', 'xml',
	'pdf', 'zip', 'js', 'css', 'png', 'jpg', 'jpeg', 'gif', 'svg',
]);

/** Whether `address` is a host name given without a scheme, and not a file name. */
function isBareHost(address: string): boolean {
	const match = BARE_HOST.exec(address);
	if (!match) return false;
	const lone = match[0] === address;
	return !(lone && FILE_ENDINGS.has(match[1].toLowerCase()));
}

/**
 * The value as an http(s) link target, or null when it is no web address.
 *
 * For links whose target comes from outside the admin, such as a package's
 * `homepage` from its blueprint or the GPM feed. Svelte does not filter `href`,
 * so a `javascript:` or `data:` value would otherwise become a live link. Takes
 * `unknown` because such values pass through the API untyped: YAML can hand over
 * `false`, a number or a map, and those count as no URL.
 *
 * Many blueprints leave out the scheme (`homepage: github.com/me/my-plugin`), so
 * a bare host name gets `https://`; a file name such as `README.md` does not.
 */
export function webUrl(value: unknown): string | null {
	const address = text(value);
	if (address === '') return null;
	return httpUrl(address) ?? (isBareHost(address) ? httpUrl(`https://${address}`) : null);
}

/**
 * A link target for a value that is either an http(s) address or a path on this
 * site, or null for anything else (javascript:, data:, blob: and so on), so the
 * value renders as inert text instead.
 *
 * A path is resolved against `origin` and has to stay on it: browsers also read
 * `/\host`, `\\host` and `///host` as another host, so a value that looks like
 * a path could otherwise leave the site. A plain protocol-relative `//host/...`
 * is an address, not a path, and links to that host like an absolute one. No
 * bare host names here (`docs.html` is a file on the site). `origin` is a
 * `location.origin` value.
 */
export function safeHref(value: unknown, origin: string = window.location.origin): string | null {
	const address = text(value);
	if (address === '') return null;
	const absolute = httpUrl(address);
	if (absolute !== null) return absolute;
	try {
		const url = new URL(address, origin);
		// `blob:https://site/…` reports the site's origin: check the scheme too.
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
		if (url.origin === origin) return url.href;
		// Browsers drop tabs and line breaks anywhere in an address before they
		// read it (`//\t/host` is `///host`), so a value with any is no plain
		// `//host` address, whatever its first characters.
		return /^\/\/[^/\\]/.test(address) && !/[\t\n\r]/.test(address) ? url.href : null;
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
