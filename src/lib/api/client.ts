import { auth } from '$lib/stores/auth.svelte';

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

	private async handleResponse<T>(response: Response): Promise<T> {
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
		options: {
			body?: unknown;
			params?: Record<string, string>;
			headers?: Record<string, string>;
			retry?: boolean;
		} = {}
	): Promise<T> {
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
			auth.logout();
			throw new ApiRequestError(
				{ status: 401, title: 'Unauthorized', detail: 'Session expired. Please log in again.' },
				response
			);
		}

		return this.handleResponse<T>(response);
	}

	private async tryRefresh(): Promise<boolean> {
		if (!auth.refreshToken) return false;

		// Deduplicate concurrent refresh attempts
		if (!this.refreshPromise) {
			this.refreshPromise = this.doRefresh();
		}

		try {
			return await this.refreshPromise;
		} finally {
			this.refreshPromise = null;
		}
	}

	private async doRefresh(): Promise<boolean> {
		try {
			const response = await fetch(`${this.baseUrl}/auth/refresh`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json'
				},
				body: JSON.stringify({ refresh_token: auth.refreshToken })
			});

			if (!response.ok) return false;

			const body = await response.json();
			const data = body.data ?? body;
			auth.setTokens(data.access_token, data.refresh_token, data.expires_in);
			return true;
		} catch {
			return false;
		}
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
}

export const api = new ApiClient();
