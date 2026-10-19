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
