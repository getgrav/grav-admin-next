import { api } from '../client';
import { auth } from '$lib/stores/auth.svelte';
import { extractEtag } from '$lib/utils/etag';
import type { BlueprintSchema } from './blueprints';

// --- Directory config types ---

export interface FlexListFieldConfig {
	field?: { type: string; label?: string; format?: string };
	width?: number;
	link?: string;
}

export interface FlexListOptions {
	/** Initial page size for the list (overridden by an explicit per_page query). */
	per_page?: number;
	/** Initial sort applied when the user has not chosen a column. */
	order?: { by?: string; dir?: 'asc' | 'desc' };
}

export interface FlexListConfig {
	title?: string;
	fields: Record<string, FlexListFieldConfig>;
	options?: FlexListOptions;
	detail?: FlexDetailConfig;
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
	/** Maps select/checkbox/radio list fields to their value→label option map, so cells can show labels instead of raw keys. */
	field_options?: Record<string, Record<string, string>>;
	export?: Record<string, unknown>;
}

export interface FlexDetailConfig {
	enabled: boolean;
	label?: string;
	title?: string;
	icon?: string;
	limit?: number;
	actions?: boolean;
	relation: {
		type: string;
		local_key: string;
		foreign_key: string;
		sort?: { by?: string; dir?: 'asc' | 'desc' };
	};
	fields: Record<string, FlexListFieldConfig>;
	field_types?: Record<string, string>;
	field_options?: Record<string, Record<string, string>>;
}

// --- Object types ---

/**
 * Read-only metadata the API returns under the reserved `__meta` key: the
 * identifier used in code/templates plus where the object lives on disk.
 * Never sent back on save (stripped in the edit view).
 */
export interface FlexObjectMeta {
	type: string;
	key: string;
	storageKey: string;
	storagePath?: string;
}

export type FlexObject = Record<string, unknown> & {
	key: string;
	__meta?: FlexObjectMeta;
	__detail?: {
		type: string;
		title?: string;
		label?: string;
		filter?: Record<string, string | number | boolean>;
		limit?: number;
		sort?: { by?: string; dir?: 'asc' | 'desc' };
		actions?: boolean;
	};
};

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

export async function getDirectoryMetadata(type: string): Promise<FlexDirectoryInfo> {
	return api.get<FlexDirectoryInfo>(`/flex-objects/${type}/metadata`);
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
		filters?: Record<string, string | number | boolean | null | undefined>;
	} = {},
): Promise<FlexObjectsPage> {
	const params: Record<string, string> = {};
	if (options.page) params.page = String(options.page);
	if (options.perPage) params.per_page = String(options.perPage);
	if (options.search) params.search = options.search;
	if (options.sort) params.sort = options.sort;
	if (options.order) params.order = options.order;
	if (options.filters) {
		for (const [field, value] of Object.entries(options.filters)) {
			if (value === null || value === undefined) continue;
			params[`filters[${field}]`] = String(value);
		}
	}

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
		etag: extractEtag(headers),
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
		etag: extractEtag(result.headers),
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
	if (auth.accessToken) headers['X-API-Token'] = auth.accessToken;
	const response = await fetch(`${api.baseUrl}/flex-objects/${type}/export`, { headers });
	if (!response.ok) throw new Error('Export failed');
	const disposition = response.headers.get('content-disposition') ?? '';
	const match = disposition.match(/filename="?([^"]+)"?/);
	const filename = match?.[1] ?? `${type}-export.yaml`;
	const blob = await response.blob();
	return { blob, filename };
}
