const STORAGE_KEY = 'grav_admin_prefs';

export type PagesViewMode = 'tree' | 'list' | 'miller';
export type ColorMode = 'light' | 'dark' | 'system';

interface Preferences {
	pagesViewMode: PagesViewMode;
	pagesPerPage: number;
	sidebarCollapsed: boolean;
	adminLanguage: string;
	keepAlive: boolean;
}

function loadStored(): Partial<Preferences> {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? JSON.parse(raw) : {};
	} catch {
		return {};
	}
}

function createPreferencesStore() {
	const stored = loadStored();

	let pagesViewMode = $state<PagesViewMode>(stored.pagesViewMode ?? 'tree');
	let pagesPerPage = $state(stored.pagesPerPage ?? 20);
	let sidebarCollapsed = $state(stored.sidebarCollapsed ?? false);
	let adminLanguage = $state(stored.adminLanguage ?? 'en');
	let keepAlive = $state(stored.keepAlive ?? true);

	function persist() {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({
			pagesViewMode,
			pagesPerPage,
			sidebarCollapsed,
			adminLanguage,
			keepAlive,
		}));
	}

	return {
		get pagesViewMode() { return pagesViewMode; },
		set pagesViewMode(v: PagesViewMode) { pagesViewMode = v; persist(); },

		get pagesPerPage() { return pagesPerPage; },
		set pagesPerPage(v: number) { pagesPerPage = v; persist(); },

		get sidebarCollapsed() { return sidebarCollapsed; },
		set sidebarCollapsed(v: boolean) { sidebarCollapsed = v; persist(); },

		get adminLanguage() { return adminLanguage; },
		set adminLanguage(v: string) { adminLanguage = v; persist(); },

		get keepAlive() { return keepAlive; },
		set keepAlive(v: boolean) { keepAlive = v; persist(); },
	};
}

export const prefs = createPreferencesStore();
