import { api } from '../client';

export interface PackageAuthor {
	name: string | null;
	email: string | null;
	url: string | null;
}

export interface PluginInfo {
	slug: string;
	name: string;
	version: string;
	type: 'plugin' | 'theme';
	description: string | null;
	author: PackageAuthor | null;
	homepage: string | null;
	enabled: boolean;
	available_version?: string;
	updatable?: boolean;
	premium?: boolean;
	dependencies?: string[];
	keywords?: string[];
	icon?: string;
}

/**
 * Get all installed plugins.
 */
export async function getInstalledPlugins(): Promise<PluginInfo[]> {
	return api.get<PluginInfo[]>('/gpm/plugins');
}

/**
 * Get a single installed plugin's details.
 */
export async function getPlugin(slug: string): Promise<PluginInfo> {
	return api.get<PluginInfo>(`/gpm/plugins/${slug}`);
}

/**
 * Enable or disable a plugin by updating its config.
 */
export async function setPluginEnabled(slug: string, enabled: boolean): Promise<void> {
	await api.patch(`/config/plugins/${slug}`, { enabled });
}

/**
 * Get a plugin's README.md content.
 */
export async function getPluginReadme(slug: string): Promise<string> {
	const result = await api.get<{ content: string }>(`/gpm/plugins/${slug}/readme`);
	return result.content;
}

/**
 * Get a plugin's CHANGELOG.md content.
 */
export async function getPluginChangelog(slug: string): Promise<string> {
	const result = await api.get<{ content: string }>(`/gpm/plugins/${slug}/changelog`);
	return result.content;
}

/**
 * Get plugin configuration data (with ETag for concurrency).
 */
export async function getPluginConfig(slug: string): Promise<{ data: Record<string, unknown>; etag: string }> {
	const { data, headers } = await api.requestRaw<Record<string, unknown>>('GET', `/config/plugins/${slug}`);
	return {
		data,
		etag: headers.get('etag')?.replace(/"/g, '') ?? '',
	};
}

/**
 * Save plugin configuration data (with ETag for conflict detection).
 */
export async function savePluginConfig(
	slug: string,
	config: Record<string, unknown>,
	etag?: string,
): Promise<void> {
	const headers: Record<string, string> = {};
	if (etag) headers['If-Match'] = `"${etag}"`;
	await api.requestRaw('PATCH', `/config/plugins/${slug}`, { body: config, headers });
}
