/**
 * The API always answers in JSON. A failed request whose body is an HTML page
 * (or anything else that isn't JSON) never reached Grav: the web server, a
 * security module such as mod_security, or a firewall in front of the site
 * answered it on its own. DreamHost's mod_security, for one, answers a blocked
 * request with "418 I'm a teapot" and Apache's stock error page
 * (getgrav/grav#4362).
 *
 * Saying "Request failed with status 418" gave the reader nothing to act on,
 * so name who answered and where to look instead. Only 4xx is treated this
 * way: a 5xx HTML page can just as well come from PHP itself (a fatal error),
 * where the server's error log is already the right pointer. A 404 page is
 * left out too: Grav's own HTML error page answers routes the API doesn't
 * know, so it did reach Grav.
 */
export const SERVER_PAGE_CODE = 'server_page_response';

export function isServerPageRejection(status: number, text: string): boolean {
	if (status < 400 || status > 499 || status === 404) return false;
	if (text.trim() === '') return false;
	try {
		JSON.parse(text);
		return false;
	} catch {
		return true;
	}
}

/**
 * Methods some hosts refuse before the request reaches PHP. The API accepts
 * them as POST + X-HTTP-Method-Override instead (MethodOverrideMiddleware).
 */
export const OVERRIDABLE_METHODS = new Set(['DELETE', 'PATCH', 'PUT']);

/**
 * Whether a failed DELETE/PATCH/PUT looks like the host refusing the method
 * itself, so the client should try it once more as POST + override. Some nginx
 * configs answer 405. Apache on shared hosting (OVH, for one) answers its stock
 * "403 You don't have permission to access this resource." page, which Grav
 * never writes: the API's own 403 is always JSON (getgrav/grav-plugin-admin2#219).
 * 501 is Apache's answer to a method it doesn't implement; Grav never sends it.
 */
export function isMethodRefusal(method: string, status: number, text: string): boolean {
	if (!OVERRIDABLE_METHODS.has(method.toUpperCase())) return false;
	if (status === 405 || status === 501) return true;
	return status === 403 && isServerPageRejection(status, text);
}
