/**
 * Hand an SSO result back to the window that opened this one and close, when
 * this page is running inside the sign-in-again popup. ReauthModal opens SSO
 * that way rather than navigating, because a full-page redirect would destroy
 * the SPA state and the queued requests that the modal exists to preserve.
 *
 * The popup lands on oauth-callback with a one-time code, or on the login page
 * with `?sso_error=` when the server refused. It does not exchange the code
 * itself: it has its own copy of the auth store, so a session finalized here
 * would be written to storage the opener never re-reads. Post the code instead
 * and let the opener exchange it. The code is single-use and expires in 120s,
 * so it is safe to pass across a window boundary pinned to our own origin.
 *
 * Only a same-origin opener counts: a tab some other site opened must not
 * close itself after posting into the void. Returns whether it handed off.
 */
export function reportSsoToOpener(code: string | null, failed: boolean): boolean {
	const opener = window.opener as Window | null;
	if (!opener || opener === window) return false;

	try {
		// Reading a cross-origin opener's location throws.
		if (opener.location.origin !== window.location.origin) return false;
		opener.postMessage({ type: 'grav:sso', code: code ?? null, error: failed }, window.location.origin);
	} catch {
		return false;
	}

	window.close();
	return true;
}
