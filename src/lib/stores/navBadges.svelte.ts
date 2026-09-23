/**
 * Reactive store for sidebar navigation badge counts.
 * Loaded once on authentication from /dashboard/stats.
 *
 * Two parallel maps drive the joined "capsule" badge in the sidebar:
 *   - `counts`  — total installed count (the muted right segment, every row)
 *   - `updates` — available-update count (the green left segment; only
 *                 plugins/themes carry these, and only shown when > 0)
 */

import { getStats } from '$lib/api/endpoints/dashboard';

let counts = $state<Record<string, number | null>>({});
let updates = $state<Record<string, number>>({});
let loaded = $state(false);

export const navBadges = {
	get counts() { return counts; },
	get updates() { return updates; },
	get loaded() { return loaded; },

	async load() {
		try {
			const stats = await getStats();
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
		} catch {
			// Non-critical
		}
	},

	clear() {
		counts = {};
		updates = {};
		loaded = false;
	},
};
