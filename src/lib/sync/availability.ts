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
 * A 404 from a *core* endpoint is the reliable signal — `/sync/capabilities`,
 * pull and init have all existed since the first released sync plugin (1.0.0),
 * so a 404 from any of them means the plugin isn't installed. The page editor
 * probes `/sync/capabilities` first and latches here on its 404, so a site with
 * collab enabled but no sync plugin drops straight to solo mode without first
 * firing the pull/presence pollers at missing routes.
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
