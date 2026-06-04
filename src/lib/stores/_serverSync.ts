import { toast } from 'svelte-sonner';
import { auth } from '$lib/stores/auth.svelte';
import { saveUserPreferences, type PreferencesResponse } from '$lib/api/endpoints/preferences';

/**
 * Cross-store user-preference sync helper.
 *
 * Setters in preferences/theme/branding stores apply changes optimistically
 * to local state and call `queueUserPatch(key, value)`. We accumulate keys
 * in a pending payload and flush via a single debounced PATCH so that
 * dragging the accent slider doesn't fire a request per pixel.
 *
 * `null` values are passed through verbatim — the server treats null as
 * "remove this override" (i.e. reset to site default).
 *
 * Reliability: the page-visibility and pagehide events trigger an emergency
 * `keepalive` flush so changes made within the debounce window aren't lost
 * when the user closes the tab or navigates away.
 */

const DEBOUNCE_MS = 200;

let pending: Record<string, unknown> = {};
let timer: ReturnType<typeof setTimeout> | null = null;
let flushInFlight: Promise<PreferencesResponse | null> | null = null;
let consecutiveFailures = 0;
let lastFailureToastAt = 0;

const listeners = new Set<(payload: PreferencesResponse) => void>();

export function queueUserPatch(key: string, value: unknown): void {
	pending[key] = value;
	if (timer !== null) clearTimeout(timer);
	timer = setTimeout(() => {
		void flush();
	}, DEBOUNCE_MS);
}

export async function flushNow(): Promise<PreferencesResponse | null> {
	if (timer !== null) {
		clearTimeout(timer);
		timer = null;
	}
	return flush();
}

async function flush(): Promise<PreferencesResponse | null> {
	timer = null;
	if (Object.keys(pending).length === 0) return null;
	const payload = pending;
	pending = {};

	flushInFlight = (async () => {
		try {
			const resp = await saveUserPreferences(payload);
			consecutiveFailures = 0;
			for (const cb of listeners) {
				try {
					cb(resp);
				} catch {
					/* ignore listener errors */
				}
			}
			return resp;
		} catch (err) {
			// Optimistic update already applied client-side; the next normal
			// PATCH will retry implicitly. Surface a toast once if failures
			// pile up so the user knows their changes aren't syncing.
			consecutiveFailures++;
			console.error('[preferences] sync failed:', err);
			const now = Date.now();
			if (consecutiveFailures >= 2 && now - lastFailureToastAt > 30_000) {
				lastFailureToastAt = now;
				toast.error('Preferences are not syncing to the server. Changes you make won\'t carry over to other devices.');
			}
			// Re-merge the failed payload so a later retry can include it.
			pending = { ...payload, ...pending };
			return null;
		} finally {
			flushInFlight = null;
		}
	})();
	return flushInFlight;
}

/**
 * Best-effort flush during page-hide / visibility-change / unload. Uses
 * `fetch(..., { keepalive: true })` so the request survives navigation
 * even if the page is being torn down. No retries, no toast — this is a
 * fire-and-forget last-ditch save.
 */
function emergencyFlush(): void {
	if (timer !== null) {
		clearTimeout(timer);
		timer = null;
	}
	if (Object.keys(pending).length === 0) return;

	const payload = pending;
	pending = {};

	const url = `${auth.serverUrl}${auth.apiPrefix || '/api/v1'}/admin-next/preferences/user`;
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		Accept: 'application/json',
	};
	if (auth.accessToken) headers['X-API-Token'] = auth.accessToken;
	headers['X-Grav-Environment'] = auth.gravEnvironment;

	try {
		void fetch(url, {
			method: 'PATCH',
			headers,
			body: JSON.stringify(payload),
			keepalive: true,
		}).catch(() => {
			// Re-stash so we try again if the user comes back to this tab.
			pending = { ...payload, ...pending };
		});
	} catch {
		pending = { ...payload, ...pending };
	}
}

if (typeof window !== 'undefined') {
	// `pagehide` covers both close-tab and bfcache; `visibilitychange` covers
	// the user backgrounding the tab. Together they catch the common cases
	// where a normal fetch would be cancelled mid-flight.
	window.addEventListener('pagehide', emergencyFlush);
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') emergencyFlush();
	});
}

export function onPreferencesUpdated(cb: (payload: PreferencesResponse) => void): () => void {
	listeners.add(cb);
	return () => listeners.delete(cb);
}

/** True if there's an unsent payload or an in-flight request. */
export function hasPendingSync(): boolean {
	return Object.keys(pending).length > 0 || flushInFlight !== null;
}
