/**
 * Turn a URL the API returns for a site file into one the browser can load.
 *
 * `serverUrl` is the site root the admin talks to: '' on a root install, '/sub'
 * on a subfolder install, or 'https://host/sub' when it was typed in on the
 * login screen. Grav's own file URLs already carry the subfolder
 * ('/sub/user/...'), API routes don't ('/api/v1/...'), so a leading slash alone
 * can't tell whether the subfolder still has to be added.
 */
export function resolveSiteUrl(url: string, serverUrl: string): string {
	// http(s):, data:, blob: and protocol-relative URLs are complete already.
	if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url)) return url;
	const server = serverUrl.replace(/\/+$/, '');
	if (!url.startsWith('/')) return `${server}/${url}`;
	const match = server.match(/^([a-z][a-z0-9+.-]*:\/\/[^/]+)(.*)$/i);
	const origin = match ? match[1] : '';
	const base = match ? match[2] : server;
	if (base && (url === base || url.startsWith(`${base}/`))) return origin + url;
	return server + url;
}

/**
 * Preview URL for a saved file-field entry, or null when there is nothing to
 * load. A `user/...` path is relative to the Grav root, the same thing classic
 * admin stored and previewed from, so it keeps working after the site moves to
 * another folder. The `url` the API returns has the folder of upload time baked
 * in, so it is only the fallback.
 */
export function fileEntryUrl(
	entry: { path?: string; url?: string },
	serverUrl: string,
): string | null {
	if (entry.path?.startsWith('user/')) return resolveSiteUrl(entry.path, serverUrl);
	if (entry.url) return resolveSiteUrl(entry.url, serverUrl);
	return null;
}
