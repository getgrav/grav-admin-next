/**
 * Extract a clean ETag value from a response Headers object.
 *
 * Normalizes two kinds of noise so the stored value round-trips through a
 * subsequent `If-Match` cleanly:
 *
 *  1. Surrounding quotes (standard HTTP ETag syntax).
 *  2. Transport suffixes added by reverse proxies that serve compressed
 *     responses — Apache `mod_deflate` appends `-gzip`, some nginx builds
 *     append `-br`. Those suffixes never match the server's generated hash
 *     on a subsequent PATCH (which is typically uncompressed), so leaving
 *     them in place produces spurious 409 Conflict responses.
 */
export function extractEtag(headers: Headers): string {
	const raw = headers.get('etag');
	if (!raw) return '';
	let etag = raw.trim();
	if (etag.startsWith('W/')) etag = etag.slice(2);
	etag = etag.replace(/^"|"$/g, '');
	etag = etag.replace(/[-;](?:gzip|br|deflate)$/i, '');
	return etag;
}
