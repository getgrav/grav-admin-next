/**
 * Extract a human-meaningful message from a failed Uppy upload.
 *
 * Uppy's XHRUpload routes every non-2xx response through its fetcher, which
 * throws a generic `NetworkError` ("This looks like a network error, the
 * endpoint might be blocked by an internet provider or a firewall."). That
 * masks real server-side failures: a 422 from the API carries a problem+json
 * body like `{ status, title, detail }` (e.g. detail "Stream not resolvable:
 * 'environment://images'"), but `error.message` is the firewall guess instead.
 *
 * The raw `XMLHttpRequest` is emitted as the third argument of `upload-error`
 * (and kept on `error.request` for NetworkErrors), so we can recover the real
 * detail from its response body and only fall back to the generic message when
 * the connection genuinely failed (no parseable body).
 */
export function uploadErrorMessage(error: unknown, request?: XMLHttpRequest): string {
	const xhr = request ?? (error as { request?: XMLHttpRequest } | undefined)?.request;

	const text = xhr?.responseText;
	if (text) {
		try {
			const body = JSON.parse(text) as { detail?: unknown; title?: unknown };
			const detail = typeof body.detail === 'string' ? body.detail : '';
			const title = typeof body.title === 'string' ? body.title : '';
			const message = detail || title;
			if (message) return message;
		} catch {
			// Not JSON (HTML error page, empty body, true network failure) — fall through.
		}
	}

	if (error instanceof Error && error.message) return error.message;
	return String(error ?? 'Upload failed');
}
