import { api } from '../client';

export interface NotificationAction {
	label: string;
	url: string;
}

export interface Notification {
	id: number;
	type: 'info' | 'notice' | 'warning' | 'promo' | string;
	message: string;
	date: string;
	link?: string;
	icon?: string;
	title?: string;
	image?: string;
	accent?: string;
	action?: NotificationAction;
}

export interface DashboardStats {
	pages: { total: number; published: number };
	users: { total: number };
	plugins: { total: number; active: number };
	themes: { total: number };
	media: { total: number };
	theme: string;
	grav_version: string;
	php_version: string;
	last_backup: string | null;
}

interface NotificationsResponse {
	notifications: {
		feed: Notification[];
		dashboard: Notification[];
		top: Notification[];
	};
	last_checked: string;
}

export async function getNotifications(force = false): Promise<Notification[]> {
	const data = await api.get<NotificationsResponse>(`/dashboard/notifications${force ? '?force=true' : ''}`);
	// Combine feed and dashboard notifications. Top notifications render in
	// the banner separately — see getTopNotifications().
	return [...(data.notifications?.dashboard ?? []), ...(data.notifications?.feed ?? [])];
}

export async function getTopNotifications(force = false): Promise<Notification[]> {
	const data = await api.get<NotificationsResponse>(`/dashboard/notifications${force ? '?force=true' : ''}`);
	return data.notifications?.top ?? [];
}

export async function getStats(): Promise<DashboardStats> {
	return api.get<DashboardStats>('/dashboard/stats');
}

export interface PopularityChartPoint {
	date: string;
	views: number;
}

export interface TopPage {
	route: string;
	views: number;
}

export interface PopularityData {
	summary: {
		today: number;
		week: number;
		month: number;
	};
	chart: PopularityChartPoint[];
	top_pages: TopPage[];
}

export async function getPopularity(): Promise<PopularityData> {
	return api.get<PopularityData>('/dashboard/popularity');
}

export interface FeedItem {
	title: string;
	url: string;
	date: string;
	content?: string;
}

export interface FeedData {
	feed: FeedItem[];
	last_checked: string | null;
}

export async function getFeed(force = false): Promise<FeedData> {
	return api.get<FeedData>(`/dashboard/feed${force ? '?force=true' : ''}`);
}

export interface BackupInfo {
	filename: string;
	date: string;
	size: number;
}

export async function getBackups(): Promise<BackupInfo[]> {
	const result = await api.get<{ backups: BackupInfo[] } | BackupInfo[]>('/system/backups');
	return Array.isArray(result) ? result : result.backups ?? [];
}

export interface UpdatesData {
	grav: {
		current: string;
		available: string | null;
		updatable: boolean;
		is_symlink?: boolean;
	};
	plugins: { slug: string; name: string; available_version: string; updatable: boolean }[];
	themes: { slug: string; name: string; available_version: string; updatable: boolean }[];
	total: number;
}

export async function getUpdates(flush = false): Promise<UpdatesData> {
	return api.get<UpdatesData>('/gpm/updates', flush ? { flush: 'true' } : undefined);
}

export interface SystemInfoOverview {
	php: {
		version: string;
		memory_limit: string;
		max_execution_time: string;
		upload_max_filesize: string;
		post_max_size: string;
	};
	disk: {
		free_space: number;
		total_space: number;
	};
	plugins: {
		total: number;
		enabled: number;
		disabled: number;
	};
	cache: {
		enabled: boolean;
		driver: string;
	};
}

export async function getSystemInfoOverview(): Promise<SystemInfoOverview> {
	return api.get<SystemInfoOverview>('/systeminfo');
}
