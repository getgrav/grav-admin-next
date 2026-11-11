/**
 * Everything the dashboard loads when it opens, in one request.
 *
 * `GET /admin-next/dashboard` answers with what the dashboard's own calls
 * return, each part exactly the `data` of its endpoint. One request instead
 * of nine matters on a host with a few PHP workers on HTTP/1.1, and against
 * the API rate limit. Parts the user may not read, or that failed, are left
 * out here; the dashboard fetches those from their own endpoints.
 */

import { api } from '$lib/api/client';
import type { SystemInfo } from '$lib/api/endpoints/system';
import type { PageSummary } from '$lib/api/endpoints/pages';
import type {
	BackupsResponse,
	FeedData,
	NotificationsResponse,
	PopularityData,
	SystemInfoOverview,
	UpdatesData,
} from '$lib/api/endpoints/dashboard';
import type { DashboardWidgetsResponse } from '$lib/dashboard/types';

export interface DashboardBatch {
	system_info?: SystemInfo;
	notifications?: NotificationsResponse;
	popularity?: PopularityData;
	feed?: FeedData;
	backups?: BackupsResponse;
	updates?: UpdatesData;
	reports?: SystemInfoOverview;
	widgets?: DashboardWidgetsResponse;
	recent_pages?: PageSummary[];
}

interface DashboardBatchBody {
	data?: DashboardBatch;
	errors?: Record<string, unknown>;
}

/**
 * The parts that arrived, or null when the request failed (an older API
 * without the endpoint, or any other error): the caller then loads every
 * part on its own.
 *
 * `editableRecentPages` lists only pages the user can edit (admin2's
 * pages.only_editable).
 */
export async function getDashboardBatch(editableRecentPages: boolean): Promise<DashboardBatch | null> {
	try {
		const body = await api.getFullBody<DashboardBatchBody>(
			'/admin-next/dashboard',
			editableRecentPages ? { recent_pages: 'editable' } : undefined,
		);
		if (!body || typeof body !== 'object' || !body.data || typeof body.data !== 'object') return null;
		const data: DashboardBatch = { ...body.data };
		for (const part of Object.keys(body.errors ?? {})) delete data[part as keyof DashboardBatch];
		return data;
	} catch {
		return null;
	}
}
