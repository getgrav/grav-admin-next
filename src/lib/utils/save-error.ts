import { SERVER_PAGE_CODE } from './server-page-error.ts';

/** The detail the client writes itself when the server sent nothing usable. */
const CLIENT_DEFAULT_DETAIL = /^Request failed with status \d+$/;

/**
 * The toast for a failed config save. An ApiRequestError carries what the API
 * said, or, for a page the web server or a firewall wrote instead of the API,
 * the explanation of that (getgrav/grav#4362). The plugin and theme pages used
 * to replace both with a bare "Failed to save configuration.", so a save a
 * firewall blocked read like a Grav fault (getgrav/grav-plugin-admin2#219).
 * A failure with nothing from the server keeps the caller's generic message.
 *
 * Duck-typed rather than `instanceof ApiRequestError` so this stays free of
 * the client (and the i18n store it pulls in).
 */
export function saveErrorMessage(err: unknown, fallback: string): string {
	if (!(err instanceof Error) || !('error' in err)) return fallback;
	const apiError = (err as Error & { error?: { code?: string; detail?: string } }).error;
	if (!apiError || typeof apiError !== 'object') return fallback;
	if (apiError.code === SERVER_PAGE_CODE) return err.message || fallback;
	const detail = typeof apiError.detail === 'string' ? apiError.detail.trim() : '';
	if (detail === '' || CLIENT_DEFAULT_DETAIL.test(detail)) return fallback;
	return err.message || fallback;
}
