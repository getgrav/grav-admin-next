/**
 * `window.__GRAV_API`: Admin2's own API client, handed to plugin web
 * components (custom fields, plugin pages, panels, widgets, modals).
 *
 * A call made through it is the same as one Admin2 makes itself: the current
 * access token (refreshed when it is close to expiry, and the re-login prompt
 * when it has run out), the environment headers, the POST + override retry
 * for hosts that reject PATCH/PUT/DELETE, the 429/5xx back-off, the debug
 * panel, and the `X-Invalidates` header. That last one is what lets a plugin
 * endpoint that changes a record (`respondWithInvalidation()`) refresh the
 * screen showing it, the same way Admin2's own saves do (admin2#197).
 *
 * Paths are relative to the API prefix (`/my-plugin/stock`, not
 * `/api/v1/my-plugin/stock`). Calls resolve the response's `data` and reject
 * with an error carrying `status` and the server's `message`.
 */
export interface PluginApi {
	get<T = unknown>(path: string, params?: Record<string, string>): Promise<T>;
	post<T = unknown>(path: string, body?: unknown): Promise<T>;
	patch<T = unknown>(path: string, body?: unknown): Promise<T>;
	put<T = unknown>(path: string, body?: unknown): Promise<T>;
	delete<T = unknown>(path: string, body?: unknown): Promise<T>;
}

/**
 * Only these five go on `window`. Wrapping them, instead of handing over the
 * client itself, keeps the rest of it (caches, the re-login queue, raw
 * requests) out of the public contract.
 */
export function createPluginApi(client: PluginApi): PluginApi {
	return {
		get: (path, params) => client.get(path, params),
		post: (path, body) => client.post(path, body),
		patch: (path, body) => client.patch(path, body),
		put: (path, body) => client.put(path, body),
		delete: (path, body) => client.delete(path, body),
	};
}
