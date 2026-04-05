import { auth, decodeJwtExp } from '$lib/stores/auth.svelte';
import { authSession, type PendingRequest } from '$lib/stores/auth-session.svelte';
import { invalidations } from '$lib/stores/invalidation.svelte';

export interface ApiError {
	status: number;
	title: string;
	detail: string;
	errors?: Record<string, string[]>;
}

export class ApiRequestError extends Error {
	constructor(
		public readonly error: ApiError,
		public readonly response: Response
	) {
		super(error.detail || error.title);
		this.name = 'ApiRequestError';
	}

	get status() {
		return this.error.status;
	}
}

interface RequestOptions {
	body?: unknown;
	params?: Record<string, string>;
	headers?: Record<string, string>;
	/** Internal — disables refresh retry on recursion. */
	retry?: boolean;
}

/** Refresh proactively if the access token expires within this window. */
const PRE_EXPIRY_MS = 60_000;

class ApiClient {
	private refreshPromise: Promise<boolean> | null = null;

	get baseUrl(): string {
		const url = auth.serverUrl;
		const prefix = auth.apiPrefix || '/api/v1';
		return `${url}${prefix}`;
	}

	private get headers(): Record<string, string> {
		const h: Record<string, string> = {
			'Content-Type': 'application/json',
			Accept: 'application/json'
		};

		const token = auth.accessToken;
		if (token) {
			h['Authorization'] = `Bearer ${token}`;
		}

		const env = auth.environment;
		if (env) {
			h['X-Grav-Environment'] = env;
		}

		return h;
	}

	private get authHeaders(): Record<string, string> {
		const h: Record<string, string> = { Accept: 'application/json' };
		const token = auth.accessToken;
		if (token) h['Authorization'] = `Bearer ${token}`;
		const env = auth.environment;
		if (env) h['X-Grav-Environment'] = env;
		return h;
	}

	/**
	 * Parse the X-Invalidates response header and emit events.
	 * Tags are comma-separated, e.g. "pages:update:/blog/post-1, pages:list".
	 */
	private parseInvalidates(response: Response): void {
		const header = response.headers.get('X-Invalidates');
		if (!header) return;
		const tags = header
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean);
		if (tags.length > 0) {
			invalidations.emit(tags);
		}
	}

	/**
	 * JWT pre-check — if the token is within PRE_EXPIRY_MS of expiry, refresh
	 * before sending. Avoids unnecessary 401 round-trips.
	 */
	private async ensureFreshToken(path: string): Promise<void> {
		// Don't pre-check on auth endpoints (login/refresh/revoke).
		if (path.startsWith('/auth/')) return;
		const token = auth.accessToken;
		if (!token) return;

		const jwtExp = decodeJwtExp(token) ?? auth.expiresAt;
		if (!jwtExp) return;

		const msUntilExpiry = jwtExp - Date.now();
		if (msUntilExpiry > PRE_EXPIRY_MS) return;

		await this.tryRefresh();
	}

	private async handleResponse<T>(response: Response): Promise<T> {
		// 2xx: always parse invalidation header before returning.
		if (response.ok) {
			this.parseInvalidates(response);
		}

		if (response.status === 204) {
			return undefined as T;
		}

		const body = await response.json().catch(() => null);

		if (!response.ok) {
			const error: ApiError = body ?? {
				status: response.status,
				title: response.statusText,
				detail: `Request failed with status ${response.status}`
			};
			throw new ApiRequestError(error, response);
		}

		return body?.data !== undefined ? body.data : body;
	}

	private async request<T>(
		method: string,
		path: string,
		options: RequestOptions = {}
	): Promise<T> {
		await this.ensureFreshToken(path);

		let url = `${this.baseUrl}${path}`;

		if (options.params) {
			const searchParams = new URLSearchParams(options.params);
			url += `?${searchParams.toString()}`;
		}

		const fetchOptions: RequestInit = {
			method,
			headers: { ...this.headers, ...options.headers }
		};

		if (options.body !== undefined) {
			fetchOptions.body = JSON.stringify(options.body);
		}

		let response: Response;
		try {
			response = await fetch(url, fetchOptions);
		} catch (err) {
			throw new ApiRequestError(
				{
					status: 0,
					title: 'Network Error',
					detail: 'Unable to connect to the server. Check your connection and server URL.'
				},
				new Response(null, { status: 0 })
			);
		}

		// Auto-refresh on 401 (but not for auth endpoints or if already retrying)
		if (response.status === 401 && !path.startsWith('/auth/') && options.retry !== false) {
			const refreshed = await this.tryRefresh();
			if (refreshed) {
				return this.request<T>(method, path, { ...options, retry: false });
			}
			// Hard expiry — enqueue for modal retry instead of logging out.
			return this.enqueueForReauth<T>(method, path, options);
		}

		return this.handleResponse<T>(response);
	}

	/**
	 * Stash the failed request and open ReauthModal. Returns a promise that
	 * resolves when the modal successfully re-auths and retries, or rejects
	 * if the user signs out.
	 */
	private enqueueForReauth<T>(
		method: string,
		path: string,
		options: RequestOptions
	): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			const pending: PendingRequest = {
				method,
				path,
				body: options.body,
				params: options.params,
				headers: options.headers,
				resolve: resolve as (v: unknown) => void,
				reject,
			};
			authSession.enqueuePendingRequest(pending);
		});
	}

	/** Exposed so ReauthModal can retry queued requests after re-login. */
	async retryPending(pending: PendingRequest): Promise<unknown> {
		return this.request(pending.method, pending.path, {
			body: pending.body,
			params: pending.params,
			headers: pending.headers,
			retry: false,
		});
	}

	private async tryRefresh(): Promise<boolean> {
		if (!auth.refreshToken) return false;

		// Deduplicate concurrent refresh attempts
		if (!this.refreshPromise) {
			this.refreshPromise = authSession.performRefresh();
		}

		try {
			return await this.refreshPromise;
		} finally {
			this.refreshPromise = null;
		}
	}

	/**
	 * Make a request and return both parsed data and response headers.
	 * Useful for extracting ETag headers for optimistic concurrency.
	 */
	async requestRaw<T>(
		method: string,
		path: string,
		options: {
			body?: unknown;
			params?: Record<string, string>;
			headers?: Record<string, string>;
			retry?: boolean;
		} = {}
	): Promise<{ data: T; headers: Headers }> {
		await this.ensureFreshToken(path);

		let url = `${this.baseUrl}${path}`;

		if (options.params) {
			const searchParams = new URLSearchParams(options.params);
			url += `?${searchParams.toString()}`;
		}

		const fetchOptions: RequestInit = {
			method,
			headers: { ...this.headers, ...options.headers }
		};

		if (options.body !== undefined) {
			fetchOptions.body = JSON.stringify(options.body);
		}

		const response = await fetch(url, fetchOptions);

		if (response.status === 401 && !path.startsWith('/auth/') && options.retry !== false) {
			const refreshed = await this.tryRefresh();
			if (refreshed) {
				return this.requestRaw<T>(method, path, { ...options, retry: false });
			}
			return new Promise((resolve, reject) => {
				authSession.enqueuePendingRequest({
					method,
					path,
					body: options.body,
					params: options.params,
					headers: options.headers,
					resolve: (v) => resolve(v as { data: T; headers: Headers }),
					reject,
				});
			});
		}

		const data = await this.handleResponse<T>(response);
		return { data, headers: response.headers };
	}

	/**
	 * GET request that returns the full response body (data + meta + links)
	 * without unwrapping. Useful for paginated endpoints with extra metadata.
	 */
	async getFullBody<T = unknown>(
		path: string,
		params?: Record<string, string>,
		options: { retry?: boolean } = {},
	): Promise<T> {
		await this.ensureFreshToken(path);

		let url = `${this.baseUrl}${path}`;
		if (params) {
			const searchParams = new URLSearchParams(params);
			url += `?${searchParams.toString()}`;
		}

		const response = await fetch(url, {
			method: 'GET',
			headers: this.headers
		});

		if (response.status === 401 && !path.startsWith('/auth/') && options.retry !== false) {
			const refreshed = await this.tryRefresh();
			if (refreshed) {
				return this.getFullBody<T>(path, params, { retry: false });
			}
			return new Promise((resolve, reject) => {
				authSession.enqueuePendingRequest({
					method: 'GET_FULL',
					path,
					params,
					resolve: (v) => resolve(v as T),
					reject,
				});
			});
		}

		if (response.ok) this.parseInvalidates(response);

		const body = await response.json().catch(() => null);

		if (!response.ok) {
			const error: ApiError = body ?? {
				status: response.status,
				title: response.statusText,
				detail: `Request failed with status ${response.status}`
			};
			throw new ApiRequestError(error, response);
		}

		return body as T;
	}

	/**
	 * Ensure the access token is fresh. Returns true if the call succeeded
	 * (token was either valid or successfully refreshed). Used by external
	 * uploaders (Uppy, etc.) that don't go through ApiClient but still need
	 * a valid Bearer token.
	 */
	async ensureAuth(): Promise<boolean> {
		if (!auth.accessToken) return false;
		await this.ensureFreshToken('/ensure-auth');
		return !!auth.accessToken;
	}

	async get<T>(path: string, params?: Record<string, string>): Promise<T> {
		return this.request<T>('GET', path, { params });
	}

	async post<T>(path: string, body?: unknown): Promise<T> {
		return this.request<T>('POST', path, { body });
	}

	async patch<T>(path: string, body?: unknown): Promise<T> {
		return this.request<T>('PATCH', path, { body });
	}

	async delete<T>(path: string, body?: unknown): Promise<T> {
		return this.request<T>('DELETE', path, { body });
	}

	/**
	 * Multipart POST with auth and 401 handling. Used by Uppy, avatar upload,
	 * file fields, and media manager. Unifies the 3+ direct-fetch upload paths.
	 *
	 * - `file` can be a single File or pre-built FormData; if FormData is passed,
	 *   `fields` are ignored (caller manages all form data).
	 * - `fieldName` controls the name of the file field when `file` is a File.
	 */
	async uploadFile<T = unknown>(
		path: string,
		file: File | FormData,
		options: {
			fieldName?: string;
			fields?: Record<string, string | Blob>;
			method?: string;
			retry?: boolean;
		} = {},
	): Promise<T> {
		await this.ensureFreshToken(path);

		const url = `${this.baseUrl}${path}`;
		const method = options.method ?? 'POST';

		let formData: FormData;
		if (file instanceof FormData) {
			formData = file;
		} else {
			formData = new FormData();
			formData.append(options.fieldName ?? 'file', file);
			if (options.fields) {
				for (const [key, val] of Object.entries(options.fields)) {
					formData.append(key, val);
				}
			}
		}

		let response: Response;
		try {
			response = await fetch(url, {
				method,
				headers: this.authHeaders, // no Content-Type — browser adds multipart boundary
				body: formData,
			});
		} catch {
			throw new ApiRequestError(
				{
					status: 0,
					title: 'Network Error',
					detail: 'Unable to connect to the server. Check your connection and server URL.',
				},
				new Response(null, { status: 0 }),
			);
		}

		if (response.status === 401 && !path.startsWith('/auth/') && options.retry !== false) {
			const refreshed = await this.tryRefresh();
			if (refreshed) {
				return this.uploadFile<T>(path, file, { ...options, retry: false });
			}
			return new Promise((resolve, reject) => {
				authSession.enqueuePendingRequest({
					method: 'UPLOAD',
					path,
					body: file,
					headers: options as Record<string, unknown> as Record<string, string>,
					resolve: (v) => resolve(v as T),
					reject,
				});
			});
		}

		return this.handleResponse<T>(response);
	}

	/**
	 * Authenticated blob fetch — used by download actions that expose a file
	 * + Content-Disposition header. Pre-refreshes the token and routes through
	 * the same 401 → refresh → retry → modal flow as JSON requests.
	 */
	async fetchBlob(
		urlOrPath: string,
		options: { retry?: boolean } = {},
	): Promise<{ blob: Blob; headers: Headers }> {
		const isAbsolute = /^https?:\/\//i.test(urlOrPath);
		const url = isAbsolute ? urlOrPath : `${this.baseUrl}${urlOrPath}`;
		if (!isAbsolute) await this.ensureFreshToken(urlOrPath);

		const response = await fetch(url, {
			method: 'GET',
			headers: this.authHeaders,
		});

		if (response.status === 401 && options.retry !== false) {
			const refreshed = await this.tryRefresh();
			if (refreshed) return this.fetchBlob(urlOrPath, { retry: false });
			return new Promise((resolve, reject) => {
				authSession.enqueuePendingRequest({
					method: 'BLOB',
					path: urlOrPath,
					resolve: (v) => resolve(v as { blob: Blob; headers: Headers }),
					reject,
				});
			});
		}

		if (!response.ok) {
			throw new ApiRequestError(
				{
					status: response.status,
					title: response.statusText,
					detail: `Download failed (status ${response.status})`,
				},
				response,
			);
		}

		const blob = await response.blob();
		return { blob, headers: response.headers };
	}

	/**
	 * Authenticated text fetch — used for loading JS bundles (widget loader,
	 * custom-field modules, plugin page wrappers). Returns the raw response
	 * text; callers eval/import as they see fit.
	 */
	async fetchScript(
		urlOrPath: string,
		options: { retry?: boolean } = {},
	): Promise<string> {
		// Accept either absolute URLs or paths relative to baseUrl.
		const isAbsolute = /^https?:\/\//i.test(urlOrPath);
		const url = isAbsolute ? urlOrPath : `${this.baseUrl}${urlOrPath}`;

		// Only pre-check token for our API; external URLs skip the check.
		if (!isAbsolute) await this.ensureFreshToken(urlOrPath);

		const response = await fetch(url, {
			method: 'GET',
			headers: this.authHeaders,
		});

		if (response.status === 401 && options.retry !== false) {
			const refreshed = await this.tryRefresh();
			if (refreshed) {
				return this.fetchScript(urlOrPath, { retry: false });
			}
			return new Promise((resolve, reject) => {
				authSession.enqueuePendingRequest({
					method: 'SCRIPT',
					path: urlOrPath,
					resolve: (v) => resolve(v as string),
					reject,
				});
			});
		}

		if (!response.ok) {
			throw new ApiRequestError(
				{
					status: response.status,
					title: response.statusText,
					detail: `Failed to fetch script (status ${response.status})`,
				},
				response,
			);
		}

		return response.text();
	}
}

export const api = new ApiClient();

/**
 * Register a retry callback for the ReauthModal.
 * The modal picks this up via window so it doesn't have to import the client
 * directly (avoids circular dependency concerns with auth-session).
 */
if (typeof window !== 'undefined') {
	(window as unknown as { __apiClientRetry__?: (req: PendingRequest) => Promise<unknown> })
		.__apiClientRetry__ = (req) => {
			if (req.method === 'UPLOAD') {
				return api.uploadFile(
					req.path,
					req.body as File | FormData,
					(req.headers as unknown) as { fieldName?: string; fields?: Record<string, string | Blob>; method?: string },
				);
			}
			if (req.method === 'SCRIPT') {
				return api.fetchScript(req.path);
			}
			if (req.method === 'BLOB') {
				return api.fetchBlob(req.path);
			}
			if (req.method === 'GET_FULL') {
				return api.getFullBody(req.path, req.params);
			}
			return api.retryPending(req);
		};
}
