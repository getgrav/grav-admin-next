import { api } from '../client';
import { auth } from '$lib/stores/auth.svelte';
import type { BlueprintSchema } from './blueprints';

// --- Directory config types ---

export interface FlexListFieldConfig {
	field?: { type: string; label?: string };
	width?: number;
	link?: string;
}

export interface FlexListConfig {
	title?: string;
	fields: Record<string, FlexListFieldConfig>;
}

export interface FlexEditConfig {
	title?: { template?: string };
}

export interface FlexDirectoryInfo {
	type: string;
	title: string;
	description?: string;
	icon?: string;
	list: FlexListConfig;
	edit?: FlexEditConfig;
	search?: { fields?: string[]; options?: Record<string, unknown> };
	/** Maps list field names to their blueprint form field type (e.g., { website: 'url', published: 'toggle' }) */
	field_types?: Record<string, string>;
	export?: Record<string, unknown>;
}

// --- Object types ---

export type FlexObject = Record<string, unknown> & { key: string };

export interface FlexObjectsPage {
	objects: FlexObject[];
	total: number;
	page: number;
	perPage: number;
	totalPages: number;
}

// --- API functions ---

export async function getDirectories(): Promise<FlexDirectoryInfo[]> {
	return api.get<FlexDirectoryInfo[]>('/flex-objects');
}

interface PaginatedFlexBody {
	data?: FlexObject[];
	meta?: {
		pagination?: {
			total?: number;
			page?: number;
			per_page?: number;
			total_pages?: number;
		};
	};
}

export async function getObjects(
	type: string,
	options: {
		page?: number;
		perPage?: number;
		search?: string;
		sort?: string;
		order?: 'asc' | 'desc';
	} = {},
): Promise<FlexObjectsPage> {
	const params: Record<string, string> = {};
	if (options.page) params.page = String(options.page);
	if (options.perPage) params.per_page = String(options.perPage);
	if (options.search) params.search = options.search;
	if (options.sort) params.sort = options.sort;
	if (options.order) params.order = options.order;

	const body = await api.getFullBody<PaginatedFlexBody>(
		`/flex-objects/${type}`,
		params,
	);

	const objects: FlexObject[] = body.data ?? [];
	const meta = body.meta?.pagination ?? {};

	return {
		objects,
		total: meta.total ?? objects.length,
		page: meta.page ?? (options.page ?? 1),
		perPage: meta.per_page ?? (options.perPage ?? 20),
		totalPages: meta.total_pages ?? 1,
	};
}

export async function getObject(
	type: string,
	key: string,
): Promise<{ object: FlexObject; etag: string }> {
	const { data, headers } = await api.requestRaw<FlexObject>(
		'GET',
		`/flex-objects/${type}/${key}`,
	);
	return {
		object: data,
		etag: headers.get('etag')?.replace(/"/g, '') ?? '',
	};
}

export async function createObject(
	type: string,
	data: Record<string, unknown>,
): Promise<FlexObject> {
	return api.post<FlexObject>(`/flex-objects/${type}`, data);
}

export async function updateObject(
	type: string,
	key: string,
	data: Record<string, unknown>,
	etag?: string,
): Promise<{ object: FlexObject; etag: string }> {
	const headers: Record<string, string> = {};
	if (etag) headers['If-Match'] = `"${etag}"`;
	const result = await api.requestRaw<FlexObject>(
		'PATCH',
		`/flex-objects/${type}/${key}`,
		{ body: data, headers },
	);
	return {
		object: result.data,
		etag: result.headers.get('etag')?.replace(/"/g, '') ?? '',
	};
}

export async function deleteObject(type: string, key: string): Promise<void> {
	await api.delete(`/flex-objects/${type}/${key}`);
}

export async function getFlexBlueprint(type: string): Promise<BlueprintSchema> {
	return api.get<BlueprintSchema>(`/blueprints/flex-objects/${type}`);
}

/**
 * Download export of all objects in a flex directory as YAML.
 */
export async function exportObjects(type: string): Promise<{ blob: Blob; filename: string }> {
	const headers: Record<string, string> = { Accept: 'application/x-yaml' };
	if (auth.accessToken) headers['Authorization'] = `Bearer ${auth.accessToken}`;
	const response = await fetch(`${api.baseUrl}/flex-objects/${type}/export`, { headers });
	if (!response.ok) throw new Error('Export failed');
	const disposition = response.headers.get('content-disposition') ?? '';
	const match = disposition.match(/filename="?([^"]+)"?/);
	const filename = match?.[1] ?? `${type}-export.yaml`;
	const blob = await response.blob();
	return { blob, filename };
}
