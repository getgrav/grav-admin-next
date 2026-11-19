import { isServerPageRejection } from './server-page-error.ts';

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
 *
 * A 4xx page written by the web server or a firewall in front of it (such as
 * a Cloudflare challenge) never reached Grav; `serverPage` turns its status
 * into the caller's translated explanation of that.
 */
export function uploadErrorMessage(
	error: unknown,
	request?: XMLHttpRequest,
	serverPage?: (status: number) => string,
): string {
	const xhr = uploadXhr(error, request);

	const text = xhr?.responseText;
	if (xhr && serverPage && isServerPageRejection(xhr.status, text ?? '')) {
		return serverPage(xhr.status);
	}
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

/**
 * Whether a failed upload is the API itself refusing the change (a JSON 403),
 * as opposed to demo mode, or a firewall or web server page that blocked the
 * request before it reached Grav (admin2#209 wording must not blame the page's
 * permissions for those).
 */
export function isApiForbiddenUpload(error: unknown, request?: XMLHttpRequest): boolean {
	const xhr = uploadXhr(error, request);
	if (xhr?.status !== 403) return false;
	const text = xhr.responseText ?? '';
	return !isServerPageRejection(403, text) && !text.includes('demo_mode_write_blocked');
}

function uploadXhr(error: unknown, request?: XMLHttpRequest): XMLHttpRequest | undefined {
	return request ?? (error as { request?: XMLHttpRequest } | undefined)?.request;
}
