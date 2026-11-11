/**
 * One shared copy of `/dashboard/stats`.
 *
 * The sidebar badges, the dashboard and the pages list all show numbers from
 * the same endpoint, which walks every page on the server. They read it from
 * here instead of each fetching their own: a load already in flight is shared,
 * and `ensure()` reuses a recent answer.
 */

import { getStats, type DashboardStats } from '$lib/api/endpoints/dashboard';
import { takeBootPart } from '$lib/stores/boot';

let stats = $state.raw<DashboardStats | null>(null);
let fetchedAt = 0;
let inflight: Promise<DashboardStats | null> | null = null;
const listeners = new Set<(stats: DashboardStats) => void>();

/**
 * `fromBoot`: take the stats that came with the boot request when they're
 * still fresh (the sidebar badges' first load), else fetch.
 */
function load(fromBoot = false): Promise<DashboardStats | null> {
	if (inflight) return inflight;
	const fetchStats = fromBoot
		? takeBootPart<DashboardStats>('stats').then((part) => part?.value ?? getStats())
		: getStats();
	inflight = fetchStats
		.then((next) => {
			stats = next;
			fetchedAt = Date.now();
			for (const fn of listeners) {
				try {
					fn(next);
				} catch {
					/* a listener's failure is its own */
				}
			}
			return next;
		})
		.catch(() => stats)
		.finally(() => {
			inflight = null;
		});
	return inflight;
}

export const dashboardStats = {
	/** The last answer, or null before the first one arrives. */
	get value() {
		return stats;
	},

	/** Fetch now (joining a load already in flight). */
	load,

	/** Fetch only if the last answer is older than `maxAgeMs`. */
	ensure(maxAgeMs = 30_000): Promise<DashboardStats | null> {
		if (stats && Date.now() - fetchedAt < maxAgeMs) return Promise.resolve(stats);
		// A recent answer is all the caller wants, and the boot request's is
		// at most a few seconds old.
		return load(true);
	},

	/** Run `fn` after every successful load. Returns an unsubscribe function. */
	subscribe(fn: (stats: DashboardStats) => void): () => void {
		listeners.add(fn);
		return () => listeners.delete(fn);
	},

	clear() {
		stats = null;
		fetchedAt = 0;
	},
};
