import { api } from '../client';
import type { DashboardLayout, DashboardWidgetsResponse } from '$lib/dashboard/types';

export async function getWidgets(): Promise<DashboardWidgetsResponse> {
	return api.get<DashboardWidgetsResponse>('/dashboard/widgets');
}

export async function saveUserLayout(layout: DashboardLayout): Promise<DashboardWidgetsResponse> {
	return api.patch<DashboardWidgetsResponse>('/dashboard/layout', layout);
}

export async function saveSiteLayout(layout: DashboardLayout): Promise<DashboardWidgetsResponse> {
	return api.patch<DashboardWidgetsResponse>('/dashboard/site-layout', layout);
}

export async function dismissNotification(id: number | string): Promise<void> {
	await api.post<void>(`/dashboard/notifications/${id}/hide`, {});
}
