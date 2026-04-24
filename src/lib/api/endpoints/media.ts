import { api } from '../client';

export interface MediaItem {
	filename: string;
	path?: string;
	url: string;
	thumbnail_url?: string;
	type: string;
	size: number;
	dimensions?: {
		width: number;
		height: number;
	};
	modified: string;
}

export interface FolderInfo {
	name: string;
	path: string;
	children_count: number;
	file_count: number;
}

export interface Pagination {
	page: number;
	per_page: number;
	total: number;
	total_pages: number;
}

export interface SiteMediaResponse {
	items: MediaItem[];
	folders: FolderInfo[];
	path: string;
	pagination: Pagination;
	search?: string;
}

interface SiteMediaApiBody {
	data: MediaItem[];
	meta: {
		pagination: Pagination;
		path: string;
		folders: FolderInfo[];
		search?: string;
	};
}

export interface SiteMediaParams {
	path?: string;
	search?: string;
	type?: string;
	page?: number;
	per_page?: number;
}

// ── Site media ──────────────────────────────────────────────────────────

/**
 * List site-level media files and folders at a given path.
 */
export async function getSiteMedia(params: SiteMediaParams = {}): Promise<SiteMediaResponse> {
	const query: Record<string, string> = {};
	if (params.path) query.path = params.path;
	if (params.search) query.search = params.search;
	if (params.type) query.type = params.type;
	if (params.page) query.page = String(params.page);
	if (params.per_page) query.per_page = String(params.per_page);

	const body = await api.getFullBody<SiteMediaApiBody>('/media', query);

	return {
		items: body.data,
		folders: body.meta.folders,
		path: body.meta.path,
		pagination: body.meta.pagination,
		search: body.meta.search,
	};
}

/**
 * Delete a site media file (supports paths like "subfolder/file.jpg").
 */
export async function deleteSiteMedia(filePath: string): Promise<void> {
	return api.delete(`/media/${encodeURIComponent(filePath)}`);
}

/**
 * Create a new folder in site media.
 */
export async function createFolder(path: string): Promise<FolderInfo> {
	return api.post<FolderInfo>('/media/folders', { path });
}

/**
 * Delete an empty folder from site media.
 */
export async function deleteFolder(path: string): Promise<void> {
	return api.delete(`/media/folders/${encodeURIComponent(path)}`);
}

/**
 * Rename or move a site media file.
 */
export async function renameSiteMedia(from: string, to: string): Promise<MediaItem> {
	return api.post<MediaItem>('/media/rename', { from, to });
}

/**
 * Rename a folder.
 */
export async function renameFolder(from: string, to: string): Promise<FolderInfo> {
	return api.post<FolderInfo>('/media/folders/rename', { from, to });
}

// ── Page media (existing) ───────────────────────────────────────────────

/**
 * Get all media files for a page
 */
/**
 * Normalize a route for page-media API calls. Returns `null` for empty or
 * root (`/`) routes — those can't address a real page via the media
 * endpoints (a bare `/pages//media` collapses to `/pages/media` on the wire
 * and 404s / 405s). Callers should skip the request in that case; the host
 * page is expected to redirect the user to the home alias's structural
 * route (e.g. `/home`) before issuing media calls.
 */
function normalizePageRoute(route: string): string | null {
	const trimmed = route.startsWith('/') ? route.slice(1) : route;
	return trimmed === '' ? null : trimmed;
}

export async function getPageMedia(route: string): Promise<MediaItem[]> {
	const cleanRoute = normalizePageRoute(route);
	if (cleanRoute === null) return [];
	return api.get<MediaItem[]>(`/pages/${cleanRoute}/media`);
}

/**
 * Delete a media file from a page
 */
export async function deletePageMedia(route: string, filename: string): Promise<void> {
	const cleanRoute = normalizePageRoute(route);
	if (cleanRoute === null) {
		throw new Error('Cannot delete page media: route is not resolved yet.');
	}
	return api.delete(`/pages/${cleanRoute}/media/${encodeURIComponent(filename)}`);
}

/**
 * Upload a single file to a page. Goes through the unified API client so
 * 401s trigger the auth flow — prefer this over direct FormData fetch.
 *
 * (Uppy integrations in MediaManager/PageMedia/FileField continue to use
 * XHRUpload with a pre-refresh hook — this helper is for simpler callers.)
 */
export async function uploadPageMedia(route: string, file: File): Promise<MediaItem[]> {
	const cleanRoute = normalizePageRoute(route);
	if (cleanRoute === null) {
		throw new Error('Cannot upload page media: route is not resolved yet.');
	}
	return api.uploadFile<MediaItem[]>(`/pages/${cleanRoute}/media`, file, {
		fieldName: 'file',
	});
}

/**
 * Upload a single file to site media (optionally into a subfolder path).
 */
export async function uploadSiteMedia(file: File, path?: string): Promise<MediaItem[]> {
	const query = path ? `?path=${encodeURIComponent(path)}` : '';
	return api.uploadFile<MediaItem[]>(`/media${query}`, file, {
		fieldName: 'file',
	});
}

/** File descriptor returned by a blueprint-upload write. */
export interface BlueprintUploadedFile {
	name: string;
	path: string;
	size: number;
	type: string;
	url: string | null;
}

/**
 * Upload a file to the destination declared by a blueprint `type: file` field.
 *
 * @param destination  Raw blueprint destination: a Grav stream (`user://...`,
 *                     `theme://...`, `account://...`), a `self@:subpath` form
 *                     relative to the owning plugin/theme/page, or a plain
 *                     relative path under `user/`.
 * @param scope        Owner hint used to resolve `self@:`:
 *                     `plugins/<slug>`, `themes/<slug>`, `pages/<route>`,
 *                     `users/<username>`. Required when destination uses
 *                     `self@:`; otherwise the empty string is fine.
 */
export async function uploadBlueprintFile(
	destination: string,
	scope: string,
	file: File,
): Promise<BlueprintUploadedFile[]> {
	return api.uploadFile<BlueprintUploadedFile[]>(`/blueprint-upload`, file, {
		fieldName: 'file',
		fields: { destination, scope },
	});
}

/**
 * Delete a file previously written by uploadBlueprintFile. `path` is the
 * Grav-root-relative path that the upload response returned.
 */
export async function deleteBlueprintFile(path: string): Promise<void> {
	await api.delete(`/blueprint-upload`, { path });
}
