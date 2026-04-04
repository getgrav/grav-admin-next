const STORAGE_KEY = 'grav_admin_auth';

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
}

function loadStored(): StoredAuth | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? JSON.parse(raw) : null;
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
	let environment = $state(gravConfig?.environment ?? stored?.environment ?? '');
	let apiPrefix = $state(gravConfig?.apiPrefix ?? stored?.apiPrefix ?? '/api/v1');
	let accessToken = $state(stored?.accessToken ?? '');
	let refreshToken = $state(stored?.refreshToken ?? '');
	let expiresAt = $state(stored?.expiresAt ?? 0);
	let username = $state(stored?.username ?? '');
	let fullname = $state(stored?.fullname ?? '');
	let email = $state(stored?.email ?? '');
	let avatarUrl = $state(stored?.avatarUrl ?? '');
	let contentEditor = $state('');

	const isAuthenticated = $derived(!!accessToken && Date.now() < expiresAt);
	const isExpiringSoon = $derived(!!accessToken && expiresAt - Date.now() < 5 * 60 * 1000);
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
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
	}

	return {
		get serverUrl() { return serverUrl; },
		set serverUrl(v: string) { serverUrl = v; persist(); },

		get environment() { return environment; },
		set environment(v: string) { environment = v; persist(); },

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
		get hasGravConfig() { return hasGravConfig; },

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

		setServer(url: string, env: string, prefix = '/api/v1') {
			serverUrl = url.replace(/\/+$/, '');
			environment = env;
			apiPrefix = prefix;
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
			persist();
		}
	};
}

export const auth = createAuthStore();
