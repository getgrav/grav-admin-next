import { api, ApiRequestError } from '../client';
import { auth } from '$lib/stores/auth.svelte';

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

/**
 * Get paginated list of users. Uses raw fetch to preserve pagination meta.
 */
export async function getUsers(page = 1, perPage = 20): Promise<UsersPage> {
	const baseUrl = `${auth.serverUrl}${auth.apiPrefix || '/api/v1'}`;
	const url = `${baseUrl}/users?page=${page}&per_page=${perPage}`;

	const response = await fetch(url, {
		headers: {
			Accept: 'application/json',
			Authorization: `Bearer ${auth.accessToken}`,
			...(auth.environment ? { 'X-Grav-Environment': auth.environment } : {}),
		},
	});

	if (!response.ok) {
		const body = await response.json().catch(() => null);
		throw new ApiRequestError(
			body ?? { status: response.status, title: response.statusText, detail: 'Failed to fetch users' },
			response,
		);
	}

	const body = await response.json();
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
	const baseUrl = `${auth.serverUrl}${auth.apiPrefix || '/api/v1'}`;
	const formData = new FormData();
	formData.append('avatar', file);

	const response = await fetch(`${baseUrl}/users/${username}/avatar`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${auth.accessToken}`,
			...(auth.environment ? { 'X-Grav-Environment': auth.environment } : {}),
		},
		body: formData,
	});

	if (!response.ok) {
		const body = await response.json().catch(() => null);
		throw new ApiRequestError(
			body ?? { status: response.status, title: 'Upload Failed', detail: 'Failed to upload avatar' },
			response,
		);
	}

	const body = await response.json();
	return body.data ?? body;
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
