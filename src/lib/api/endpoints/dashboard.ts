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
