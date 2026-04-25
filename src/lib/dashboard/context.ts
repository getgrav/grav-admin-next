import { getContext, setContext } from 'svelte';
import type {
	DashboardStats,
	Notification,
	PopularityData,
	FeedItem,
	BackupInfo,
	UpdatesData,
	SystemInfoOverview
} from '$lib/api/endpoints/dashboard';
import type { SystemInfo } from '$lib/api/endpoints/system';
import type { PageSummary } from '$lib/api/endpoints/pages';

export interface DashboardData {
	stats: DashboardStats | null;
	systemInfo: SystemInfo | null;
	notifications: Notification[];
	recentPages: PageSummary[];
	popularity: PopularityData | null;
	feed: FeedItem[];
	backups: BackupInfo[];
	updates: UpdatesData | null;
	reports: SystemInfoOverview | null;
	animated: boolean;
	updatingAll: boolean;
	upgradingGrav: boolean;
	creatingBackup: boolean;
	canWriteGpm: boolean;
	canWriteSystem: boolean;
	onUpdateAll: () => void | Promise<void>;
	onUpgradeGrav: () => void | Promise<void>;
	onCreateBackup: () => void | Promise<void>;
}

const KEY = Symbol('dashboard-data');

export function setDashboardData(data: () => DashboardData): void {
	setContext(KEY, data);
}

export function getDashboardData(): () => DashboardData {
	const ctx = getContext<() => DashboardData>(KEY);
	if (!ctx) throw new Error('getDashboardData must be called inside a <DashboardGrid> tree');
	return ctx;
}
