/**
 * Auth session manager — consolidated JWT lifecycle control.
 *
 * Responsibilities:
 *   - Single proactive refresh timer, scheduled at exp - 60s (via JWT decode)
 *   - Window focus listener that silently refreshes a token that lapsed while
 *     the tab was in the background, and only prompts if that fails
 *   - Cross-tab sync: refresh tokens rotate, so a pair minted in one tab is
 *     adopted by the others instead of leaving them holding a revoked one
 *   - Opens ReauthModal on hard expiry / refresh failure, preserving pending request
 *   - Re-auth flow: user re-enters password → new token swapped in → pending retry fires
 *
 * Replaces the duplicate refresh timer that used to live in AppShell.svelte.
 */

import { auth, decodeJwtExp, AUTH_STORAGE_KEY } from './auth.svelte';

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
	let storageListenerAttached = false;
	/** The refresh currently in flight, shared by every caller (see performRefresh). */
	let refreshInFlight: Promise<boolean> | null = null;

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

	/** One trip to /auth/refresh with a specific token. Stores the new pair on success. */
	async function postRefresh(token: string): Promise<boolean> {
		try {
			const baseUrl = `${auth.serverUrl}${auth.apiPrefix || '/api/v1'}`;
			const response = await fetch(`${baseUrl}/auth/refresh`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
				body: JSON.stringify({ refresh_token: token }),
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

	/**
	 * Refresh, treating "another tab got there first" as success rather than as
	 * a dead session.
	 *
	 * The server rotates refresh tokens and revokes the old one on every use, so
	 * a rejected refresh usually means a sibling tab refreshed a moment ago and
	 * the token we sent had already been spent. In that case the pair that tab
	 * persisted is sitting in localStorage, valid — adopt it. Only when there is
	 * nothing newer to adopt, and a retry with the adopted token also fails, is
	 * the session genuinely unrecoverable.
	 */
	async function refreshOnce(): Promise<boolean> {
		const token = auth.refreshToken;
		if (!token) return false;

		if (await postRefresh(token)) return true;

		if (!auth.adoptStoredTokens()) return false;

		// The adopted access token is normally minutes old — no second trip needed.
		const jwtExp = decodeJwtExp(auth.accessToken) ?? auth.expiresAt;
		if (jwtExp && jwtExp - Date.now() > PRE_EXPIRY_MS) return true;

		return auth.refreshToken !== token ? postRefresh(auth.refreshToken) : false;
	}

	/**
	 * Refresh the token pair, coalescing concurrent callers onto a single
	 * request. Rotation makes this mandatory rather than an optimisation: two
	 * overlapping refreshes send the same token, and the one that lands second
	 * is rejected because the first already spent it. The API client used to
	 * dedupe on its own side, which left the scheduled timer — the one caller
	 * that doesn't go through the client — free to collide with it.
	 */
	function performRefresh(): Promise<boolean> {
		if (!refreshInFlight) {
			refreshInFlight = refreshOnce().finally(() => {
				refreshInFlight = null;
			});
		}
		return refreshInFlight;
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

	async function handleFocus() {
		const jwtExp = decodeJwtExp(auth.accessToken) ?? auth.expiresAt;
		if (!auth.accessToken || !jwtExp) return;

		// Still valid: just reschedule, since the timer may have drifted while
		// the tab was throttled or the machine asleep.
		if (jwtExp > Date.now()) {
			schedule();
			return;
		}

		// Expired by the clock — which is the ordinary state of any tab left in
		// the background for an hour, because a throttled or suspended timer
		// never fired. The refresh token is good for days, so recover silently
		// the way the boot path in +layout.svelte does, and prompt only if that
		// actually fails. Prompting on the clock alone put a password box in
		// front of a live session, and reloading the page always cleared it —
		// because the boot path ran the refresh this one skipped.
		if (await performRefresh()) {
			schedule();
			return;
		}

		openReauth();
	}

	/**
	 * Another tab rotated the token pair. Adopt it, and if this tab is sitting
	 * on a re-auth prompt, retract it and let the queued requests through — the
	 * session was never gone.
	 */
	function handleStorage(event: StorageEvent) {
		if (event.key !== null && event.key !== AUTH_STORAGE_KEY) return;
		if (!auth.adoptStoredTokens()) return;

		if (reauthOpen) {
			closeReauth();
			const retry = (window as unknown as {
				__apiClientRetry__?: (req: PendingRequest) => Promise<unknown>;
			}).__apiClientRetry__;
			if (retry) void retryPending(retry);
		}

		schedule();
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

	function attachStorageListener() {
		if (storageListenerAttached || typeof window === 'undefined') return;
		window.addEventListener('storage', handleStorage);
		storageListenerAttached = true;
	}

	function detachStorageListener() {
		if (!storageListenerAttached || typeof window === 'undefined') return;
		window.removeEventListener('storage', handleStorage);
		storageListenerAttached = false;
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
		attachStorageListener();
		schedule();
	}

	/** Tear down — call on logout. */
	function stop() {
		clearTimer();
		detachFocusListener();
		detachStorageListener();
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
