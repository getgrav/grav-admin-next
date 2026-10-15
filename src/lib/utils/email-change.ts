/**
 * Helpers for an email change that waits for confirmation (Login plugin
 * 3.10.0 and API plugin 1.0.50 or later).
 *
 * Kept free of imports so they can be tested on their own. The error is read by
 * its fields rather than `instanceof ApiRequestError` for the same reason.
 */

/** The sentence the API puts in `meta.message` after it starts or resends a change, if there is one. */
export function metaMessage(meta: unknown): string | undefined {
	if (!meta || typeof meta !== 'object') return undefined;
	const message = (meta as { message?: unknown }).message;
	return typeof message === 'string' && message.trim() !== '' ? message : undefined;
}

/**
 * The server's own sentence for a refused email change: 422 for an address
 * that is taken or not valid, 429 for too many changes in an hour. Null for any
 * other failure, which keeps the caller's generic message.
 *
 * Takes `message` rather than `error.detail` so a 422 that lists field errors
 * says which field, the way the rest of the app does; for the email change
 * the two are the same sentence.
 */
export function emailChangeRefusal(err: unknown): string | null {
	if (!err || typeof err !== 'object') return null;
	const status = (err as { status?: unknown }).status;
	if (status !== 422 && status !== 429) return null;
	const error = (err as { error?: { detail?: unknown } }).error;
	const detail = typeof error?.detail === 'string' ? error.detail.trim() : '';
	const message =
		typeof (err as { message?: unknown }).message === 'string'
			? (err as { message: string }).message.trim()
			: '';
	return (status === 422 ? message || detail : detail || message) || null;
}
