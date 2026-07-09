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

/** Normalized form for comparing two URLs for equality (protocol/case/trailing-slash insensitive). */
export function sameUrl(a: string | null | undefined, b: string | null | undefined): boolean {
	const norm = (u: string | null | undefined) =>
		(u ?? '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase();
	const na = norm(a);
	return na !== '' && na === norm(b);
}
