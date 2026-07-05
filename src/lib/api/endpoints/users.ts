import { api } from '../client';
import { extractEtag } from '$lib/utils/etag';
import type { IconSpec } from '$lib/utils/icon-spec';

export interface UserInfo {
	username: string;
	email: string | null;
	fullname: string | null;
	title: string | null;
	state: 'enabled' | 'disabled';
	access: Record<string, unknown>;
	groups: string[];
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
	/**
	 * Plugin-owned scalar values for any custom columns declared via
	 * onApiUserListColumns (getgrav/grav-plugin-admin2#111). Keyed by a column's
	 * `field`; present only on the list endpoint, and only for users a plugin
	 * returned data for. Always scalars — the API strips anything else.
	 */
	extra?: Record<string, string | number | boolean | null>;
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

export interface UserListFilters {
	/** Free-text search across username/email/fullname/title (server-side). */
	search?: string;
	/** Permission key — keeps users effectively granted it (incl. via group/super). */
	access?: string;
	/** Group name — keeps users belonging to that group. */
	group?: string;
	/**
	 * Active Users-tab id (see getUserFilters). Sent to the server as `filter`,
	 * which fires onApiUserListFilter so a plugin can narrow the listing before
	 * pagination. `all` (or empty) means the unfiltered list.
	 */
	filter?: string;
}

/**
 * A tab in the Users-list nav row. The built-in `all` tab is always returned
 * first; the rest come from plugins via the onApiUserListFilters event.
 */
export interface UserFilterTab {
	id: string;
	plugin: string;
	label: string;
	icon?: IconSpec;
	priority?: number;
	badge?: string | number | null;
	/** API path returning { count: N }, refreshed live (mirrors sidebar badges). */
	badgeEndpoint?: string;
}

/**
 * The Users-list filter policy: the tab row plus which tab the client lands on
 * with no `?filter` in the URL, and whether the built-in "All Users" tab is
 * present (a plugin can suppress it via showAll:false on onApiUserListFilters).
 */
export interface UserFilterPolicy {
	tabs: UserFilterTab[];
	defaultFilter: string;
	showAll: boolean;
}

/**
 * Fetch the filter policy for the Users list. Requires api.users.read; callers
 * without it should not render the tab row. Selecting a non-default tab adds its
 * id as the `filter` param on getUsers().
 *
 * Tolerates the pre-1.0.4 API shape (a bare tab array) so a newer admin2 still
 * works against an older API plugin.
 */
export async function getUserFilters(): Promise<UserFilterPolicy> {
	const res = await api.get<UserFilterPolicy | UserFilterTab[]>('/users/filters');
	if (Array.isArray(res)) {
		return { tabs: res, defaultFilter: 'all', showAll: true };
	}
	return {
		tabs: res.tabs ?? [],
		defaultFilter: res.defaultFilter ?? 'all',
		showAll: res.showAll ?? true,
	};
}

/**
 * A client-side renderer a plugin column may name. The server validates this
 * against the same whitelist, so an unknown value never reaches us — but we
 * default to 'text' anyway. No renderer function or HTML crosses the wire.
 */
export type ColumnFormatter = 'text' | 'link' | 'date' | 'datetime' | 'boolean' | 'number' | 'badge';

/**
 * A plugin-declared extra column for the Users list (onApiUserListColumns).
 * Admin owns the table; the plugin only describes the column. Per-user values
 * ride along inside each UserInfo.extra, keyed by `field`.
 */
export interface UserColumn {
	id: string;
	plugin: string;
	label: string;
	/** Key into each user's `extra` map. */
	field: string;
	formatter: ColumnFormatter;
	/** Client-side sort, current page only (data is page-scoped). */
	sortable?: boolean;
	priority?: number;
}

/**
 * Fetch the plugin-declared column set for the Users list. Requires
 * api.users.read. Tolerates an API plugin that predates the columns contract
 * (404 / no `columns` key) by returning an empty list, so a newer admin2 still
 * works against an older API.
 */
export async function getUserColumns(): Promise<UserColumn[]> {
	try {
		const res = await api.get<{ columns?: UserColumn[] } | UserColumn[]>('/users/columns');
		if (Array.isArray(res)) return res;
		return res.columns ?? [];
	} catch {
		return [];
	}
}

/**
 * Get paginated list of users. Uses getFullBody to preserve pagination meta.
 *
 * Search and the access/group filters are applied server-side so they span the
 * whole account set, not just the loaded page.
 */
export async function getUsers(page = 1, perPage = 20, filters: UserListFilters = {}): Promise<UsersPage> {
	const params: Record<string, string> = {
		page: String(page),
		per_page: String(perPage),
	};
	if (filters.search) params.search = filters.search;
	if (filters.access) params.access = filters.access;
	if (filters.group) params.group = filters.group;
	if (filters.filter && filters.filter !== 'all') params.filter = filters.filter;

	const body = await api.getFullBody<PaginatedUsersBody>('/users', params);

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
		etag: extractEtag(headers),
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
		etag: extractEtag(result.headers),
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
