import { api } from '../client';
import { extractEtag } from '$lib/utils/etag';

export interface GroupInfo {
	groupname: string;
	readableName: string;
	description: string;
	icon: string;
	enabled: boolean;
	access: Record<string, unknown>;
}

export interface GroupsPage {
	groups: GroupInfo[];
	total: number;
	page: number;
	perPage: number;
	totalPages: number;
}

interface PaginatedGroupsBody {
	data?: GroupInfo[];
	meta?: { pagination?: { total?: number; page?: number; per_page?: number; total_pages?: number } };
}

export async function getGroups(page = 1, perPage = 20, search?: string): Promise<GroupsPage> {
	const params: Record<string, string> = {
		page: String(page),
		per_page: String(perPage),
	};
	if (search) params.search = search;

	const body = await api.getFullBody<PaginatedGroupsBody>('/groups', params);
	const groups = body.data ?? [];
	const meta = body.meta?.pagination ?? {};
	return {
		groups,
		total: meta.total ?? groups.length,
		page: meta.page ?? page,
		perPage: meta.per_page ?? perPage,
		totalPages: meta.total_pages ?? 1,
	};
}

export async function getGroup(name: string): Promise<{ group: GroupInfo; etag: string }> {
	const { data, headers } = await api.requestRaw<GroupInfo>('GET', `/groups/${name}`);
	return { group: data, etag: extractEtag(headers) };
}

export async function createGroup(data: Partial<GroupInfo> & { groupname: string }): Promise<GroupInfo> {
	return api.post<GroupInfo>('/groups', data);
}

export async function updateGroup(
	name: string,
	data: Record<string, unknown>,
	etag?: string,
): Promise<{ group: GroupInfo; etag: string }> {
	const headers: Record<string, string> = {};
	if (etag) headers['If-Match'] = `"${etag}"`;
	const result = await api.requestRaw<GroupInfo>('PATCH', `/groups/${name}`, {
		body: data,
		headers,
	});
	return { group: result.data, etag: extractEtag(result.headers) };
}

export async function deleteGroup(name: string): Promise<void> {
	await api.delete(`/groups/${name}`);
}
