import { scopedKey } from '$lib/utils/scopedStorage';

const STORAGE_KEY = scopedKey('grav_admin_auth');

interface StoredAuth {
	serverUrl: string;
	environment: string;
	apiPrefix: string;
	accessToken: string;
	refreshToken: string;
	expiresAt: number;
	username: string;
	fullname: string;
	email: string;
	avatarUrl: string;
	superAdmin?: boolean;
	access?: Record<string, boolean>;
	gravVersion?: string;
	adminVersion?: string;
	demoMode?: boolean;
	demoWritable?: string[];
	demoResetInterval?: number;
	demoSecondsUntilReset?: number | null;
	/** Local ms timestamp captured when demo state was last synced — anchors the countdown. */
	demoStateFetchedAt?: number;
}

/** Per-account demo-mode block from the server (GET /me and login payloads). */
export interface DemoModeInfo {
	enabled: boolean;
	writable?: string[];
	reset_interval?: number;
	seconds_until_reset?: number | null;
}

function loadStored(): StoredAuth | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? JSON.parse(raw) : null;
	} catch {
		return null;
	}
}

/**
 * Decode a JWT's payload (base64url) and return its `exp` claim in ms, if present.
 * Returns null if the token is malformed or has no exp.
 */
export function decodeJwtExp(token: string): number | null {
	try {
		const parts = token.split('.');
		if (parts.length < 2) return null;
		// base64url → base64
		const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
		const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
		const payload = JSON.parse(atob(padded));
		if (typeof payload.exp !== 'number') return null;
		return payload.exp * 1000; // seconds → ms
	} catch {
		return null;
	}
}

/** Config injected by the Admin Pro plugin via window.__GRAV_CONFIG__ */
interface GravConfig {
	serverUrl: string;
	apiPrefix: string;
	basePath: string;
	environment: string;
}

function getGravConfig(): GravConfig | null {
	if (typeof window !== 'undefined' && (window as any).__GRAV_CONFIG__) {
		return (window as any).__GRAV_CONFIG__ as GravConfig;
	}
	return null;
}

function createAuthStore() {
	const stored = loadStored();
	const gravConfig = getGravConfig();

	let serverUrl = $state(gravConfig?.serverUrl ?? stored?.serverUrl ?? '');
	// The session environment is user-selectable (topbar switcher), so a stored
	// choice must win over the host-detected default. gravConfig.environment
	// (Uri::environment()) only seeds the very first boot, before any choice is
	// persisted; '' is a valid explicit choice meaning base/"Default".
	let environment = $state(stored?.environment ?? gravConfig?.environment ?? '');

	// Plugin pages, custom fields and widgets run outside this store and make
	// their own API calls with `window.__GRAV_API_TOKEN`. They need the picker's
	// selection beside it, or a button on a plugin page writes base config
	// while the form beside it writes the selected environment. Mirrored as the
	// same `default` sentinel the request headers carry.
	const mirrorEnvironment = () => {
		if (typeof window !== 'undefined') window.__GRAV_ENVIRONMENT = environment || 'default';
	};
	mirrorEnvironment();
	let apiPrefix = $state(gravConfig?.apiPrefix ?? stored?.apiPrefix ?? '/api/v1');
	let accessToken = $state(stored?.accessToken ?? '');
	let refreshToken = $state(stored?.refreshToken ?? '');
	let expiresAt = $state(stored?.expiresAt ?? 0);
	let username = $state(stored?.username ?? '');
	let fullname = $state(stored?.fullname ?? '');
	let email = $state(stored?.email ?? '');
	let avatarUrl = $state(stored?.avatarUrl ?? '');
	let contentEditor = $state('');
	let superAdmin = $state(stored?.superAdmin ?? false);
	let access = $state<Record<string, boolean>>(stored?.access ?? {});
	let gravVersion = $state(stored?.gravVersion ?? '');
	let adminVersion = $state(stored?.adminVersion ?? '');
	// Demo mode. Seedable ON from the boot config to avoid a flash of enabled
	// write buttons before /me resolves; only ever flipped OFF by setDemoMode()
	// (server-driven), so a tampered boot config can pre-hint ON but never disable
	// the restriction — and the server enforces the block regardless.
	let demoMode = $state(stored?.demoMode ?? (gravConfig as any)?.demoMode ?? false);
	let demoWritable = $state<string[]>(stored?.demoWritable ?? []);
	let demoResetInterval = $state(stored?.demoResetInterval ?? 0);
	let demoSecondsUntilReset = $state<number | null>(stored?.demoSecondsUntilReset ?? null);
	let demoStateFetchedAt = $state(stored?.demoStateFetchedAt ?? 0);

	const isAuthenticated = $derived(!!accessToken && Date.now() < expiresAt);
	const isExpiringSoon = $derived(!!accessToken && expiresAt - Date.now() < 5 * 60 * 1000);
	// A session is recoverable when a refresh token is present and not itself
	// expired — even if the (short-lived) access token has already lapsed. This
	// is what lets a cold boot silently re-auth instead of bouncing to /login
	// after the browser was closed past the access-token lifetime (admin2 #55).
	// If the refresh token can't be decoded we stay optimistic and let the
	// server be the judge on the actual refresh call.
	const canRefresh = $derived(
		!!refreshToken && (decodeJwtExp(refreshToken) ?? Infinity) > Date.now()
	);
	const isSuperAdmin = $derived(superAdmin);
	const hasGravConfig = gravConfig !== null;

	function persist() {
		const data: StoredAuth = {
			serverUrl,
			environment,
			apiPrefix,
			accessToken,
			refreshToken,
			expiresAt,
			username,
			fullname,
			email,
			avatarUrl,
			superAdmin,
			access,
			gravVersion,
			adminVersion,
			demoMode,
			demoWritable,
			demoResetInterval,
			demoSecondsUntilReset,
			demoStateFetchedAt,
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
	}

	return {
		get serverUrl() { return serverUrl; },
		set serverUrl(v: string) { serverUrl = v; persist(); },

		get environment() { return environment; },
		set environment(v: string) { environment = v; mirrorEnvironment(); persist(); },

		/**
		 * The value to send as the X-Grav-Environment header. Base ('') maps to
		 * the reserved `default` sentinel (no user/env/default/ folder → Grav
		 * resolves base-only), keeping the header non-empty so proxies/FPM can't
		 * strip it. Use this everywhere the header is set.
		 */
		get gravEnvironment() { return environment || 'default'; },

		get apiPrefix() { return apiPrefix; },
		set apiPrefix(v: string) { apiPrefix = v; persist(); },

		get accessToken() { return accessToken; },
		get refreshToken() { return refreshToken; },
		get expiresAt() { return expiresAt; },

		get username() { return username; },
		get fullname() { return fullname; },
		get email() { return email; },
		get avatarUrl() { return avatarUrl; },
		get contentEditor() { return contentEditor; },

		get isAuthenticated() { return isAuthenticated; },
		get isExpiringSoon() { return isExpiringSoon; },
		get canRefresh() { return canRefresh; },
		get isSuperAdmin() { return isSuperAdmin; },
		get access() { return access; },
		get hasGravConfig() { return hasGravConfig; },
		get gravVersion() { return gravVersion; },
		get adminVersion() { return adminVersion; },

		get demoMode() { return demoMode; },
		get demoWritable() { return demoWritable; },
		get demoResetInterval() { return demoResetInterval; },
		get demoSecondsUntilReset() { return demoSecondsUntilReset; },
		get demoStateFetchedAt() { return demoStateFetchedAt; },

		setTokens(access: string, refresh: string, expiresIn: number) {
			accessToken = access;
			refreshToken = refresh;
			expiresAt = Date.now() + expiresIn * 1000;
			persist();
		},

		setUser(name: string, full: string, userEmail = '', avatar?: string, editor?: string) {
			username = name;
			fullname = full;
			email = userEmail;
			// Only update avatar if a new value is provided — don't wipe a stored
			// avatar when the API transiently returns null (e.g. thumbnail not cached)
			if (avatar !== undefined && avatar !== '') {
				avatarUrl = avatar;
			}
			if (editor !== undefined) {
				contentEditor = editor;
			}
			persist();
		},

		setPermissions(isSuperAdmin: boolean, permissions: Record<string, boolean>) {
			superAdmin = isSuperAdmin;
			access = permissions;
			persist();
		},

		/**
		 * Sync per-account demo state from a /me or login response. Call
		 * unconditionally on every such response — passing { enabled: false }
		 * clears any demo state left over from a previous session in the same
		 * browser profile, so logging into a non-demo account can never inherit a
		 * stale restriction.
		 */
		setDemoMode(info: DemoModeInfo) {
			demoMode = info.enabled;
			demoWritable = info.enabled ? (info.writable ?? []) : [];
			demoResetInterval = info.enabled ? (info.reset_interval ?? 0) : 0;
			demoSecondsUntilReset = info.enabled ? (info.seconds_until_reset ?? null) : null;
			demoStateFetchedAt = Date.now();
			persist();
		},

		setVersions(grav?: string, admin?: string) {
			if (grav) gravVersion = grav;
			if (admin) adminVersion = admin;
			persist();
		},

		setServer(url: string, env: string, prefix?: string) {
			serverUrl = url.replace(/\/+$/, '');
			environment = env;
			mirrorEnvironment();
			// Only overwrite the API prefix when one is explicitly supplied.
			// The login/setup pages call setServer(url, env) without a prefix,
			// and must not clobber the per-site prefix injected via
			// window.__GRAV_CONFIG__ (e.g. a custom `route: /grav-api`). Doing so
			// sent every post-login request to the default /api/v1 and broke
			// installs that moved the API route off /api (issue #8).
			if (prefix !== undefined) {
				apiPrefix = prefix;
			}
			persist();
		},

		logout() {
			accessToken = '';
			refreshToken = '';
			expiresAt = 0;
			username = '';
			fullname = '';
			email = '';
			avatarUrl = '';
			superAdmin = false;
			access = {};
			demoMode = false;
			demoWritable = [];
			demoResetInterval = 0;
			demoSecondsUntilReset = null;
			demoStateFetchedAt = 0;
			persist();
		}
	};
}

export const auth = createAuthStore();
