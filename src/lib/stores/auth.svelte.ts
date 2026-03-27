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
}

function loadStored(): StoredAuth | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? JSON.parse(raw) : null;
	} catch {
		return null;
	}
}

function createAuthStore() {
	const stored = loadStored();

	let serverUrl = $state(stored?.serverUrl ?? '');
	let environment = $state(stored?.environment ?? '');
	let apiPrefix = $state(stored?.apiPrefix ?? '/api/v1');
	let accessToken = $state(stored?.accessToken ?? '');
	let refreshToken = $state(stored?.refreshToken ?? '');
	let expiresAt = $state(stored?.expiresAt ?? 0);
	let username = $state(stored?.username ?? '');
	let fullname = $state(stored?.fullname ?? '');

	const isAuthenticated = $derived(!!accessToken && Date.now() < expiresAt);
	const isExpiringSoon = $derived(!!accessToken && expiresAt - Date.now() < 5 * 60 * 1000);

	function persist() {
		const data: StoredAuth = {
			serverUrl,
			environment,
			apiPrefix,
			accessToken,
			refreshToken,
			expiresAt,
			username,
			fullname
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

		get isAuthenticated() { return isAuthenticated; },
		get isExpiringSoon() { return isExpiringSoon; },

		setTokens(access: string, refresh: string, expiresIn: number) {
			accessToken = access;
			refreshToken = refresh;
			expiresAt = Date.now() + expiresIn * 1000;
			persist();
		},

		setUser(name: string, full: string) {
			username = name;
			fullname = full;
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
			persist();
		}
	};
}

export const auth = createAuthStore();
