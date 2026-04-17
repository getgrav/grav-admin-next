import { api } from '../client';

export interface Notification {
	id: number;
	type: string;
	message: string;
	date: string;
	link?: string;
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

export async function getNotifications(): Promise<Notification[]> {
	const data = await api.get<NotificationsResponse>('/dashboard/notifications');
	// Combine feed and dashboard notifications
	return [...(data.notifications?.dashboard ?? []), ...(data.notifications?.feed ?? [])];
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

export async function getFeed(): Promise<FeedData> {
	return api.get<FeedData>('/dashboard/feed');
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

export async function getUpdates(): Promise<UpdatesData> {
	return api.get<UpdatesData>('/gpm/updates');
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
