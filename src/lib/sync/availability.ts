/**
 * Session-level latch for "the API has no /sync routes".
 *
 * When the collab (grav-plugin-sync) endpoints aren't installed, every
 * `/sync/*` request returns 404. The collab pollers would otherwise retry
 * those missing endpoints forever, flooding the network tab and wasting
 * requests for the whole edit session. The first 404 from a core sync
 * endpoint flips this latch; the pollers then stand down and the page
 * editor skips collab entirely until a reload. (getgrav/grav-plugin-admin2#73)
 *
 * A 404 from a *core* endpoint (pull / init) is the reliable signal — those
 * exist in every version of the sync plugin, so their absence means the
 * plugin isn't there. We deliberately do NOT latch on a `/sync/capabilities`
 * 404 alone, since an older sync plugin can lack that newer route while still
 * serving pull/push.
 */

let unavailable = false;

/** Record that the sync endpoints are absent for this session. */
export function markSyncUnavailable(): void {
	unavailable = true;
}

/** True once a core /sync endpoint has 404'd this session. */
export function isSyncUnavailable(): boolean {
	return unavailable;
}

/** Clear the latch (used by tests and on logout). */
export function resetSyncAvailability(): void {
	unavailable = false;
}

/** Whether an unknown error looks like a 404 (missing route). */
export function isNotFoundError(e: unknown): boolean {
	return !!e && typeof e === 'object' && (e as { status?: number }).status === 404;
}
