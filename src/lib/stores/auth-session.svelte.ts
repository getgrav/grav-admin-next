/**
 * Auth session manager — consolidated JWT lifecycle control.
 *
 * Responsibilities:
 *   - Single proactive refresh timer, scheduled at exp - 60s (via JWT decode)
 *   - Window focus listener that verifies token still valid on tab return
 *   - Opens ReauthModal on hard expiry / refresh failure, preserving pending request
 *   - Re-auth flow: user re-enters password → new token swapped in → pending retry fires
 *
 * Replaces the duplicate refresh timer that used to live in AppShell.svelte.
 */

import { auth, decodeJwtExp } from './auth.svelte';

/** Pre-refresh window: trigger refresh this many ms before exp. */
const PRE_EXPIRY_MS = 60_000;
/** Minimum wait before scheduling — prevents tight loops. */
const MIN_DELAY_MS = 5_000;
/** Network-error retry delay. */
const NETWORK_RETRY_MS = 30_000;

/**
 * Snapshot of a request that was in flight when auth failed. The API client
 * populates this via setPendingRequest() before opening the modal; the modal
 * clears it after retrying (or if the user cancels).
 */
export interface PendingRequest {
	method: string;
	path: string;
	body?: unknown;
	params?: Record<string, string>;
	headers?: Record<string, string>;
	resolve: (value: unknown) => void;
	reject: (err: unknown) => void;
}

function createAuthSession() {
	let refreshTimer: ReturnType<typeof setTimeout> | null = null;
	let reauthOpen = $state(false);
	let pendingRequests: PendingRequest[] = [];
	let focusListenerAttached = false;

	function clearTimer() {
		if (refreshTimer) {
			clearTimeout(refreshTimer);
			refreshTimer = null;
		}
	}

	/** Compute ms until we should trigger a refresh (exp - 60s), clamped. */
	function getRefreshDelay(): number | null {
		const token = auth.accessToken;
		if (!token) return null;

		// Prefer JWT exp claim; fall back to stored expiresAt.
		const jwtExp = decodeJwtExp(token);
		const expiresAtMs = jwtExp ?? auth.expiresAt;
		if (!expiresAtMs) return null;

		const delay = expiresAtMs - Date.now() - PRE_EXPIRY_MS;
		return Math.max(MIN_DELAY_MS, delay);
	}

	async function performRefresh(): Promise<boolean> {
		if (!auth.refreshToken) return false;
		try {
			const baseUrl = `${auth.serverUrl}${auth.apiPrefix || '/api/v1'}`;
			const response = await fetch(`${baseUrl}/auth/refresh`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
				body: JSON.stringify({ refresh_token: auth.refreshToken }),
			});
			if (!response.ok) return false;
			const body = await response.json();
			const data = body.data ?? body;
			auth.setTokens(data.access_token, data.refresh_token, data.expires_in);
			return true;
		} catch {
			return false;
		}
	}

	function schedule() {
		clearTimer();
		const delay = getRefreshDelay();
		if (delay === null) return;

		refreshTimer = setTimeout(async () => {
			const ok = await performRefresh();
			if (ok) {
				schedule();
			} else if (auth.refreshToken) {
				// Distinguish hard-expiry from transient network failures.
				// If the JWT is truly expired (by clock) treat as hard failure;
				// otherwise retry once in 30s before giving up.
				const jwtExp = decodeJwtExp(auth.accessToken) ?? auth.expiresAt;
				if (jwtExp && jwtExp < Date.now()) {
					openReauth();
				} else {
					refreshTimer = setTimeout(schedule, NETWORK_RETRY_MS);
				}
			} else {
				openReauth();
			}
		}, delay);
	}

	function handleFocus() {
		// On tab focus: if token is already expired, open modal; else reschedule
		// (timer may have drifted while tab was throttled).
		const jwtExp = decodeJwtExp(auth.accessToken) ?? auth.expiresAt;
		if (!auth.accessToken || !jwtExp) return;
		if (jwtExp <= Date.now()) {
			openReauth();
		} else {
			schedule();
		}
	}

	function attachFocusListener() {
		if (focusListenerAttached || typeof window === 'undefined') return;
		window.addEventListener('focus', handleFocus);
		focusListenerAttached = true;
	}

	function detachFocusListener() {
		if (!focusListenerAttached || typeof window === 'undefined') return;
		window.removeEventListener('focus', handleFocus);
		focusListenerAttached = false;
	}

	function openReauth() {
		clearTimer();
		reauthOpen = true;
	}

	function closeReauth() {
		reauthOpen = false;
	}

	/** Called by ApiClient on 401 after refresh fails. Stores retry state. */
	function enqueuePendingRequest(req: PendingRequest) {
		pendingRequests.push(req);
		openReauth();
	}

	/** Called by ReauthModal after successful re-login — resolves all queued. */
	async function retryPending(retry: (req: PendingRequest) => Promise<unknown>) {
		const queue = pendingRequests;
		pendingRequests = [];
		for (const req of queue) {
			try {
				const result = await retry(req);
				req.resolve(result);
			} catch (err) {
				req.reject(err);
			}
		}
	}

	/** Reject all queued requests (user gave up / signed out). */
	function rejectPending(err: unknown) {
		const queue = pendingRequests;
		pendingRequests = [];
		for (const req of queue) {
			req.reject(err);
		}
	}

	/** Start the lifecycle — call once when app mounts and user is authenticated. */
	function start() {
		attachFocusListener();
		schedule();
	}

	/** Tear down — call on logout. */
	function stop() {
		clearTimer();
		detachFocusListener();
		rejectPending(new Error('Session stopped'));
		closeReauth();
	}

	return {
		get reauthOpen() { return reauthOpen; },
		get pendingCount() { return pendingRequests.length; },

		start,
		stop,
		schedule,
		openReauth,
		closeReauth,
		enqueuePendingRequest,
		retryPending,
		rejectPending,
		performRefresh,
	};
}

export const authSession = createAuthSession();
