/**
 * Turn a URL the API returns into one the browser can load.
 *
 * `serverUrl` is the site root the admin talks to: '' on a root install, '/sub'
 * on a subfolder install, or 'https://host/sub' when it was typed in on the
 * login screen. `apiPrefix` is the API's own path ('/api/v1', or whatever the
 * api plugin's route is set to), the same value the admin builds its requests
 * from.
 *
 * The API returns two kinds of path. A file's own URL already carries the
 * subfolder ('/sub/user/...'); the API's routes don't ('/api/v1/thumbnails/...',
 * '/api/v1/media/raw/...'). So a leading slash alone can't tell whether the
 * subfolder still has to be added: a path that starts with the API prefix is an
 * API route and gets the subfolder, one that already starts with the subfolder
 * keeps it, anything else gets it. Checking the API prefix first keeps a site
 * whose subfolder looks like the start of an API path (a site at '/api') right.
 */
export function resolveSiteUrl(url: string, serverUrl: string, apiPrefix = '/api/v1'): string {
	// http(s):, data:, blob: and protocol-relative URLs are complete already.
	if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url)) return url;
	const server = serverUrl.replace(/\/+$/, '');
	if (!url.startsWith('/')) return `${server}/${url}`;
	const match = server.match(/^([a-z][a-z0-9+.-]*:\/\/[^/]+)(.*)$/i);
	const origin = match ? match[1] : '';
	const base = match ? match[2] : server;
	const api = apiPrefix.replace(/\/+$/, '');
	const within = (path: string, prefix: string) =>
		prefix !== '' && (path === prefix || path.startsWith(`${prefix}/`));
	if (within(url, base + api)) return origin + url;
	if (within(url, api)) return server + url;
	if (within(url, base)) return origin + url;
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
	apiPrefix?: string,
): string | null {
	if (entry.path?.startsWith('user/')) return resolveSiteUrl(entry.path, serverUrl, apiPrefix);
	if (entry.url) return resolveSiteUrl(entry.url, serverUrl, apiPrefix);
	return null;
}
