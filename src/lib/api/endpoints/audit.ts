import { api } from '../client';
import { auth } from '$lib/stores/auth.svelte';

// ── Audit trail ──
//
// Read-only client for the super-admin audit log (Tools → Audit Trail). The
// backend lives in the API plugin; every route is gated on `api.super`.

export interface AuditRetention {
	days: number;
	max_rows: number;
}

export interface AuditStatus {
	enabled: boolean;
	/** Whether the SQLite backend is present at all (false on hardened PHP). */
	available: boolean;
	coverage: 'standard' | 'detailed';
	retention: AuditRetention;
	total: number | null;
}

export interface AuditEvent {
	id: number;
	/** UTC epoch milliseconds. */
	ts: number;
	/** Typed `namespace.action` code, e.g. `page.update`, `user.login.failed`. */
	event: string;
	severity: 'info' | 'notice' | 'warning' | 'error';
	actor_id: string | null;
	actor_name: string | null;
	actor_roles: string[];
	auth_method: string | null;
	ip: string | null;
	user_agent: string | null;
	target_type: string | null;
	target_id: string | null;
	status: number | null;
	context: Record<string, unknown> | null;
}

export interface AuditEventsResponse {
	data: AuditEvent[];
	meta: {
		pagination: {
			total: number;
			page: number;
			per_page: number;
			total_pages: number;
		};
	};
}

export interface AuditFacets {
	events: string[];
	actors: { id: string | null; name: string | null }[];
}

export interface AuditEventFilters {
	page?: number;
	per_page?: number;
	event?: string;
	actor?: string;
	target_type?: string;
	severity?: string;
	/** UTC epoch milliseconds, inclusive lower bound. */
	from?: number;
	/** UTC epoch milliseconds, inclusive upper bound. */
	to?: number;
	q?: string;
}

export async function getAuditStatus(): Promise<AuditStatus> {
	return api.get<AuditStatus>('/audit/status');
}

export async function getAuditEvents(filters: AuditEventFilters): Promise<AuditEventsResponse> {
	const qp: Record<string, string> = {};
	for (const [key, value] of Object.entries(filters)) {
		if (value !== undefined && value !== null && value !== '') {
			qp[key] = String(value);
		}
	}
	return api.getFullBody<AuditEventsResponse>('/audit/events', qp);
}

export async function getAuditFacets(): Promise<AuditFacets> {
	return api.get<AuditFacets>('/audit/facets');
}

/**
 * Build a download URL for the export endpoint. The access token rides as a
 * query param (same mechanism as the backup download link) so a plain anchor
 * navigation authenticates.
 */
export function getAuditExportUrl(format: 'csv' | 'json', filters: AuditEventFilters): string {
	const base = `${auth.serverUrl}${auth.apiPrefix || '/api/v1'}`;
	const qp = new URLSearchParams({ format, token: auth.accessToken });
	for (const [key, value] of Object.entries(filters)) {
		// Pagination doesn't apply to exports.
		if (key === 'page' || key === 'per_page') continue;
		if (value !== undefined && value !== null && value !== '') {
			qp.set(key, String(value));
		}
	}
	return `${base}/audit/export?${qp.toString()}`;
}
