import { api } from '../client';

export interface MediaItem {
	filename: string;
	url: string;
	type: string;
	size: number;
	dimensions?: {
		width: number;
		height: number;
	};
	modified: string;
}

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
