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
export async function getPageMedia(route: string): Promise<MediaItem[]> {
	const cleanRoute = route.startsWith('/') ? route.slice(1) : route;
	return api.get<MediaItem[]>(`/pages/${cleanRoute}/media`);
}

/**
 * Delete a media file from a page
 */
export async function deletePageMedia(route: string, filename: string): Promise<void> {
	const cleanRoute = route.startsWith('/') ? route.slice(1) : route;
	return api.delete(`/pages/${cleanRoute}/media/${encodeURIComponent(filename)}`);
}
