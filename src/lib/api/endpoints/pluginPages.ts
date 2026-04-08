import { api } from '../client';
import type { BlueprintSchema } from './blueprints';

export interface PluginPageAction {
	id: string;
	label: string;
	icon?: string;
	method?: string;
	endpoint?: string;
	primary?: boolean;
	upload?: boolean;
	download?: boolean;
	confirm?: string;
	/** Navigate to this route when clicked (component-mode pages) */
	navigate?: string;
}

export interface PluginPageDefinition {
	id: string;
	plugin: string;
	title: string;
	icon?: string;
	page_type: 'blueprint' | 'component';
	blueprint?: string;
	data_endpoint?: string;
	save_endpoint?: string;
	actions?: PluginPageAction[];
	has_custom_component?: boolean;
}

export async function getPluginPageDefinition(slug: string): Promise<PluginPageDefinition> {
	return api.get<PluginPageDefinition>(`/gpm/plugins/${slug}/page`);
}

export async function getPluginPageBlueprint(plugin: string, pageId: string): Promise<BlueprintSchema> {
	return api.get<BlueprintSchema>(`/blueprints/plugins/${plugin}/pages/${pageId}`);
}

export async function getPluginPageData(endpoint: string): Promise<Record<string, unknown>> {
	return api.get<Record<string, unknown>>(endpoint);
}

export async function savePluginPageData(endpoint: string, data: Record<string, unknown>): Promise<void> {
	await api.patch(endpoint, data);
}

/**
 * Execute a plugin page action (POST/PUT/DELETE, no body).
 * Returns the parsed JSON result — callers inspect `.message` / `.data`.
 */
export async function executePluginPageAction(
	endpoint: string,
	method: string = 'POST',
): Promise<Record<string, unknown>> {
	const m = method.toUpperCase();
	if (m === 'DELETE') return api.delete<Record<string, unknown>>(endpoint);
	if (m === 'PATCH') return api.patch<Record<string, unknown>>(endpoint);
	return api.post<Record<string, unknown>>(endpoint);
}

/**
 * Upload a file to a plugin page's action endpoint (multipart POST).
 * Returns the parsed JSON result.
 */
export async function uploadPluginPageFile(
	endpoint: string,
	file: File,
): Promise<Record<string, unknown>> {
	return api.uploadFile<Record<string, unknown>>(endpoint, file, { fieldName: 'file' });
}

/**
 * Download a plugin page action's response as a Blob, with the
 * Content-Disposition-derived filename.
 */
export async function downloadPluginPageFile(
	endpoint: string,
	fallbackName: string,
): Promise<{ blob: Blob; filename: string }> {
	const { blob, headers } = await api.fetchBlob(endpoint);
	const cd = headers.get('Content-Disposition');
	const filename = cd?.match(/filename="?(.+?)"?$/)?.[1] ?? fallbackName;
	return { blob, filename };
}
