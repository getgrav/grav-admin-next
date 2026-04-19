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
	/** Description rendered to safe HTML (inline markdown resolved). Null if no description. */
	description_html?: string | null;
	author: PackageAuthor | null;
	homepage: string | null;
	enabled: boolean;
	available_version?: string;
	updatable?: boolean;
	premium?: boolean;
	is_symlink?: boolean;
	dependencies?: string[];
	keywords?: string[];
	icon?: string;
	/** Custom admin-next field types provided by this plugin (type → type name) */
	custom_fields?: Record<string, string>;
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

// ---------------------------------------------------------------------------
// Repository / GPM operations
// ---------------------------------------------------------------------------

export interface RepositoryPlugin {
	slug: string;
	name: string;
	version: string;
	type: 'plugin' | 'theme';
	description: string | null;
	/** Description rendered to safe HTML (inline markdown resolved). Null if no description. */
	description_html?: string | null;
	author: PackageAuthor | null;
	homepage: string | null;
	installed: boolean;
	premium?: boolean;
	licensed?: boolean;
	purchase_url?: string;
	dependencies?: string[];
	keywords?: string[];
	icon?: string;
}

/**
 * Get available plugins from the GPM repository.
 * Uses a large per_page to fetch all in one request.
 */
export async function getRepositoryPlugins(): Promise<RepositoryPlugin[]> {
	return api.get<RepositoryPlugin[]>('/gpm/repository/plugins', { per_page: '500' });
}

export interface InstallPackageResult {
	message: string;
	package: string;
	type: 'plugin' | 'theme';
	/** Slugs of dependency packages that were installed alongside the main package. */
	dependencies: string[];
}

/**
 * Install a plugin by slug. Returns the installed package plus any dependencies
 * that were also installed.
 */
export async function installPlugin(slug: string): Promise<InstallPackageResult> {
	return api.post<InstallPackageResult>('/gpm/install', { package: slug, type: 'plugin' });
}

/**
 * Remove/delete a plugin by slug.
 */
export async function removePlugin(slug: string): Promise<void> {
	await api.post('/gpm/remove', { package: slug });
}

/**
 * Check for available updates (flush=true refreshes GPM cache).
 */
export async function checkUpdates(flush = true): Promise<{ total: number }> {
	return api.get<{ total: number }>('/gpm/updates', { flush: flush ? 'true' : 'false' });
}

export interface UpdatePackageResult {
	message: string;
	package: string;
	type: 'plugin' | 'theme';
	/** Slugs of dependency packages that were installed alongside the updated package. */
	dependencies: string[];
}

export interface UpdateAllResult {
	updated: string[];
	failed: { package: string; error: string }[];
}

export interface GravUpgradeResult {
	message: string;
	previous_version: string;
	new_version: string;
}

/**
 * Update a single package (plugin or theme). Type is auto-detected server-side.
 */
export async function updatePackage(slug: string): Promise<UpdatePackageResult> {
	return api.post<UpdatePackageResult>('/gpm/update', { package: slug });
}

/**
 * Update all updatable plugins and themes in a single request.
 */
export async function updateAllPackages(): Promise<UpdateAllResult> {
	return api.post<UpdateAllResult>('/gpm/update-all', {});
}

/**
 * Self-upgrade Grav core. Refuses when Grav is installed via symlink.
 */
export async function upgradeGrav(): Promise<GravUpgradeResult> {
	return api.post<GravUpgradeResult>('/gpm/upgrade', {});
}

// ---------------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------------

export interface ThemeInfo {
	slug: string;
	name: string;
	version: string;
	type: 'theme';
	description: string | null;
	/** Description rendered to safe HTML (inline markdown resolved). Null if no description. */
	description_html?: string | null;
	author: PackageAuthor | null;
	homepage: string | null;
	enabled: boolean;
	available_version?: string;
	updatable?: boolean;
	premium?: boolean;
	is_symlink?: boolean;
	dependencies?: string[];
	keywords?: string[];
	icon?: string;
	thumbnail?: string | null;
	screenshot?: string | null;
}

export async function getInstalledThemes(): Promise<ThemeInfo[]> {
	return api.get<ThemeInfo[]>('/gpm/themes');
}

export async function getTheme(slug: string): Promise<ThemeInfo> {
	return api.get<ThemeInfo>(`/gpm/themes/${slug}`);
}

/**
 * Activate a theme by setting it as the system theme.
 */
export async function setActiveTheme(slug: string): Promise<void> {
	await api.patch('/config/system', { pages: { theme: slug } });
}

export async function getThemeReadme(slug: string): Promise<string> {
	const result = await api.get<{ content: string }>(`/gpm/themes/${slug}/readme`);
	return result.content;
}

export async function getThemeChangelog(slug: string): Promise<string> {
	const result = await api.get<{ content: string }>(`/gpm/themes/${slug}/changelog`);
	return result.content;
}

export async function getThemeConfig(slug: string): Promise<{ data: Record<string, unknown>; etag: string }> {
	const { data, headers } = await api.requestRaw<Record<string, unknown>>('GET', `/config/themes/${slug}`);
	return {
		data,
		etag: headers.get('etag')?.replace(/"/g, '') ?? '',
	};
}

export async function saveThemeConfig(
	slug: string,
	config: Record<string, unknown>,
	etag?: string,
): Promise<void> {
	const headers: Record<string, string> = {};
	if (etag) headers['If-Match'] = `"${etag}"`;
	await api.requestRaw('PATCH', `/config/themes/${slug}`, { body: config, headers });
}

export interface RepositoryTheme {
	slug: string;
	name: string;
	version: string;
	type: 'theme';
	description: string | null;
	/** Description rendered to safe HTML (inline markdown resolved). Null if no description. */
	description_html?: string | null;
	author: PackageAuthor | null;
	homepage: string | null;
	installed: boolean;
	premium?: boolean;
	licensed?: boolean;
	purchase_url?: string;
	dependencies?: string[];
	keywords?: string[];
	icon?: string;
	screenshot?: string | null;
}

export async function getRepositoryThemes(): Promise<RepositoryTheme[]> {
	return api.get<RepositoryTheme[]>('/gpm/repository/themes', { per_page: '500' });
}

export async function installTheme(slug: string): Promise<InstallPackageResult> {
	return api.post<InstallPackageResult>('/gpm/install', { package: slug, type: 'theme' });
}

export async function removeTheme(slug: string): Promise<void> {
	await api.post('/gpm/remove', { package: slug });
}
