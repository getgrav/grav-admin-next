import { api } from '../client';

export interface UserInfo {
	username: string;
	email: string | null;
	fullname: string | null;
	title: string | null;
	state: 'enabled' | 'disabled';
	access: Record<string, unknown>;
	avatar_url: string | null;
	twofa_enabled: boolean;
	twofa_secret: boolean;
	/**
	 * System capability flag — true if plugins.login.twofa_enabled is on
	 * globally, meaning per-user 2FA is actually enforced at login. Only
	 * set on single-user detail responses, not the list endpoint.
	 */
	twofa_global_enabled?: boolean;
	created: string | null;
	modified: string | null;
}

export interface UsersPage {
	users: UserInfo[];
	total: number;
	page: number;
	perPage: number;
	totalPages: number;
}

interface PaginatedUsersBody {
	data?: UserInfo[];
	meta?: { pagination?: { total?: number; page?: number; per_page?: number; total_pages?: number } };
}

/**
 * Get paginated list of users. Uses getFullBody to preserve pagination meta.
 */
export async function getUsers(page = 1, perPage = 20): Promise<UsersPage> {
	const body = await api.getFullBody<PaginatedUsersBody>('/users', {
		page: String(page),
		per_page: String(perPage),
	});

	const users: UserInfo[] = body.data ?? [];
	const meta = body.meta?.pagination ?? {};

	return {
		users,
		total: meta.total ?? users.length,
		page: meta.page ?? page,
		perPage: meta.per_page ?? perPage,
		totalPages: meta.total_pages ?? 1,
	};
}

export async function getUser(username: string): Promise<{ user: UserInfo; etag: string }> {
	const { data, headers } = await api.requestRaw<UserInfo>('GET', `/users/${username}`);
	return {
		user: data,
		etag: headers.get('etag')?.replace(/"/g, '') ?? '',
	};
}

export async function createUser(data: {
	username: string;
	password: string;
	email: string;
	fullname?: string;
	title?: string;
	state?: string;
	access?: Record<string, unknown>;
}): Promise<UserInfo> {
	return api.post<UserInfo>('/users', data);
}

export async function updateUser(
	username: string,
	data: Record<string, unknown>,
	etag?: string,
): Promise<{ user: UserInfo; etag: string }> {
	const headers: Record<string, string> = {};
	if (etag) headers['If-Match'] = `"${etag}"`;
	const result = await api.requestRaw<UserInfo>('PATCH', `/users/${username}`, {
		body: data,
		headers,
	});
	return {
		user: result.data,
		etag: result.headers.get('etag')?.replace(/"/g, '') ?? '',
	};
}

export async function deleteUser(username: string): Promise<void> {
	await api.delete(`/users/${username}`);
}

export async function uploadAvatar(username: string, file: File): Promise<UserInfo> {
	return api.uploadFile<UserInfo>(`/users/${username}/avatar`, file, {
		fieldName: 'avatar',
	});
}

export async function deleteAvatar(username: string): Promise<UserInfo> {
	return api.delete<UserInfo>(`/users/${username}/avatar`);
}

export interface TwoFactorData {
	secret: string;
	qr_code: string;
}

export async function generate2fa(username: string): Promise<TwoFactorData> {
	return api.post<TwoFactorData>(`/users/${username}/2fa`);
}

export async function enable2fa(username: string, code: string): Promise<{ twofa_enabled: true }> {
	return api.post<{ twofa_enabled: true }>(`/users/${username}/2fa/enable`, { code });
}

export async function disable2fa(username: string, code?: string): Promise<{ twofa_enabled: false }> {
	const body: Record<string, string> = {};
	if (code) body.code = code;
	return api.post<{ twofa_enabled: false }>(`/users/${username}/2fa/disable`, body);
}

// --- API Keys ---

export interface ApiKeyInfo {
	id: string;
	name: string;
	prefix: string;
	scopes: string[] | Record<string, unknown>;
	active: boolean;
	created: number | null;
	last_used: number | null;
	expires: number | null;
}

export interface ApiKeyCreated extends ApiKeyInfo {
	api_key: string;
}

export async function getApiKeys(username: string): Promise<ApiKeyInfo[]> {
	return api.get<ApiKeyInfo[]>(`/users/${username}/api-keys`);
}

export async function createApiKey(
	username: string,
	name: string,
	expiryDays?: number,
): Promise<ApiKeyCreated> {
	const body: Record<string, unknown> = { name };
	if (expiryDays && expiryDays > 0) body.expiry_days = expiryDays;
	return api.post<ApiKeyCreated>(`/users/${username}/api-keys`, body);
}

export async function deleteApiKey(username: string, keyId: string): Promise<void> {
	await api.delete(`/users/${username}/api-keys/${keyId}`);
}
