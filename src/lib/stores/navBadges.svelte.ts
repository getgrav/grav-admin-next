/**
 * Reactive store for sidebar navigation badge counts, taken from the shared
 * `/dashboard/stats` store (see dashboardStats.svelte.ts), so the sidebar and
 * the dashboard never fetch the same numbers twice.
 *
 * Two parallel maps drive the joined "capsule" badge in the sidebar:
 *   - `counts`  — total installed count (the muted right segment, every row)
 *   - `updates` — available-update count (the green left segment; only
 *                 plugins/themes carry these, and only shown when > 0)
 */

import type { DashboardStats } from '$lib/api/endpoints/dashboard';
import { dashboardStats } from './dashboardStats.svelte';

let counts = $state<Record<string, number | null>>({});
let updates = $state<Record<string, number>>({});
let loaded = $state(false);

function apply(stats: DashboardStats) {
	counts = {
		pages: stats.pages?.total ?? null,
		users: stats.users?.total ?? null,
		media: stats.media?.total ?? null,
		plugins: stats.plugins?.total ?? null,
		themes: stats.themes?.total ?? null,
	};
	// A null update count means the server could not tell this time
	// (no GPM data on disk yet). Keep what we last knew rather than
	// dropping a real badge to zero; with nothing known, show none.
	updates = {
		plugins: stats.plugins?.updatable ?? updates.plugins ?? 0,
		themes: stats.themes?.updatable ?? updates.themes ?? 0,
	};
	loaded = true;
}

// Any load of the shared stats, whoever asked for it, refreshes the badges.
dashboardStats.subscribe(apply);

export const navBadges = {
	get counts() { return counts; },
	get updates() { return updates; },
	get loaded() { return loaded; },

	async load() {
		// Failures are non-critical: the badges keep their last values.
		await dashboardStats.load();
	},

	clear() {
		counts = {};
		updates = {};
		loaded = false;
		dashboardStats.clear();
	},
};
