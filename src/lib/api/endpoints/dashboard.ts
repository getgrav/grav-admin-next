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
	/**
	 * How a promo shares the row. `full` (the default) is a banner on its own.
	 * Consecutive `half` promos sit side by side with a gap; consecutive
	 * `joined` promos form one banner divided by a hairline. Either stacks
	 * when the widget is narrow.
	 */
	layout?: 'full' | 'half' | 'joined' | string;
	/**
	 * The dashboard banner's overlay on the accent gradient: `waves`,
	 * `sparkle`, `rings` or `dots`. Each accent has a default.
	 */
	pattern?: 'waves' | 'sparkle' | 'rings' | 'dots' | string;
	/** Height of `image` in pixels, 20 to 48. The default is 28. */
	image_height?: number;
	action?: NotificationAction;
}

export interface DashboardStats {
	pages: { total: number; published: number };
	users: { total: number };
	// The update fields are null when the server has no GPM repository data on
	// disk to count from (it no longer downloads it inside this request): that
	// means "unknown", not "no updates". /gpm/updates holds the full answer.
	plugins: { total: number; active: number; updatable?: number | null };
	themes: { total: number; updatable?: number | null; active_updatable?: boolean | null };
	grav?: { updatable: boolean | null };
	media: { total: number };
	theme: string;
	grav_version: string;
	php_version: string;
	last_backup: string | null;
}

export interface NotificationsResponse {
	notifications: {
		feed: Notification[];
		dashboard: Notification[];
		'dashboard-row'?: Notification[];
		'dashboard-banner'?: Notification[];
		top: Notification[];
	};
	last_checked: string;
}

export interface DashboardNotifications {
	/** The dashboard widget's list: `dashboard-row`, then `dashboard`, then `feed`. */
	dashboard: Notification[];
	/** The banner above the widgets. */
	top: Notification[];
	/** The promo carousel under the stats row. */
	banner: Notification[];
}

/**
 * Both notification lists from one request. The widget and the top banner
 * used to ask for the same URL separately, in parallel, on every refresh.
 */
export async function getDashboardNotifications(force = false): Promise<DashboardNotifications> {
	return toDashboardNotifications(
		await api.get<NotificationsResponse>(`/dashboard/notifications${force ? '?force=true' : ''}`),
	);
}

/** The dashboard's lists from a `/dashboard/notifications` answer. */
export function toDashboardNotifications(data: NotificationsResponse): DashboardNotifications {
	// `dashboard-row` is a second dashboard list: promos that share a row with
	// the ones in `dashboard`, drawn first. It lives under its own location so
	// an admin older than this one, which reads `dashboard` alone, shows one
	// banner rather than two stacked.
	return {
		dashboard: [
			...(data.notifications?.['dashboard-row'] ?? []),
			...(data.notifications?.dashboard ?? []),
			...(data.notifications?.feed ?? []),
		],
		top: data.notifications?.top ?? [],
		// `dashboard-banner` is its own location, so admins older than the
		// carousel never see these promos.
		banner: data.notifications?.['dashboard-banner'] ?? [],
	};
}

export async function getNotifications(force = false): Promise<Notification[]> {
	return (await getDashboardNotifications(force)).dashboard;
}

export async function getTopNotifications(force = false): Promise<Notification[]> {
	return (await getDashboardNotifications(force)).top;
}

export async function getStats(): Promise<DashboardStats> {
	return api.get<DashboardStats>('/dashboard/stats');
}

export interface PopularityChartPoint {
	/** ISO day (Y-m-d) or month (Y-m). Missing before API 1.1.11. */
	key?: string;
	/** Display label, e.g. "Nov 3" or "Nov 2026". */
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
	/** The chart's time frame. Missing from API versions before 1.1.11. */
	range?: {
		key: PopularityRangeKey;
		unit: 'day' | 'month';
		total: number;
		/** Total for the period of the same length just before; null when history doesn't reach back that far. */
		previous: number | null;
	};
	chart: PopularityChartPoint[];
	top_pages: TopPage[];
}

export const POPULARITY_RANGES = ['7d', '14d', '30d', '90d', '12m'] as const;
export type PopularityRangeKey = (typeof POPULARITY_RANGES)[number];

export async function getPopularity(range?: PopularityRangeKey): Promise<PopularityData> {
	return api.get<PopularityData>('/dashboard/popularity', range ? { range } : undefined);
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

export type BackupsResponse = { backups: BackupInfo[] } | BackupInfo[];

export async function getBackups(): Promise<BackupInfo[]> {
	return toBackupList(await api.get<BackupsResponse>('/system/backups'));
}

export function toBackupList(result: BackupsResponse): BackupInfo[] {
	return Array.isArray(result) ? result : result?.backups ?? [];
}

/**
 * An outdated plugin or theme. The fields come from its entry in the GPM
 * repository feed, not from the installed blueprint; only `version` is local.
 */
export interface UpdatablePackage {
	/** Null when the feed entry has none: there's no changelog to ask for then. */
	slug: string | null;
	/** Null when the entry has no usable name; show the slug then. */
	name: string | null;
	/** Installed version (GPM puts it in place of the feed's version); null when unreadable. */
	version: string | null;
	available_version: string;
	updatable: boolean;
	/** The feed's `homepage` (or `url`); null when it has neither. Not checked: see webUrl(). */
	homepage?: string | null;
}

export interface UpdatesData {
	grav: {
		current: string;
		available: string | null;
		updatable: boolean;
		is_symlink?: boolean;
	};
	plugins: UpdatablePackage[];
	themes: UpdatablePackage[];
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
