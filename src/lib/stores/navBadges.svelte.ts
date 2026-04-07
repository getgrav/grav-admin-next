/**
 * Reactive store for sidebar navigation badge counts.
 * Loaded once on authentication from /dashboard/stats.
 */

import { getStats } from '$lib/api/endpoints/dashboard';

let counts = $state<Record<string, number | null>>({});
let loaded = $state(false);

export const navBadges = {
	get counts() { return counts; },
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
			loaded = true;
		} catch {
			// Non-critical
		}
	},

	clear() {
		counts = {};
		loaded = false;
	},
};
