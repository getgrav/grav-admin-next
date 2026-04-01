const STORAGE_KEY = 'grav_admin_prefs';

export type PagesViewMode = 'tree' | 'list' | 'miller';
export type MediaViewMode = 'grid' | 'list';
export type ColorMode = 'light' | 'dark' | 'system';

export interface MenubarLink {
	label: string;
	url: string;
	icon?: string;
	external?: boolean;
}

interface Preferences {
	pagesViewMode: PagesViewMode;
	pagesPerPage: number;
	mediaViewMode: MediaViewMode;
	sidebarCollapsed: boolean;
	adminLanguage: string;
	keepAlive: boolean;
	menubarLinks: MenubarLink[];
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
	let mediaViewMode = $state<MediaViewMode>(stored.mediaViewMode ?? 'grid');
	let sidebarCollapsed = $state(stored.sidebarCollapsed ?? false);
	let adminLanguage = $state(stored.adminLanguage ?? 'en');
	let keepAlive = $state(stored.keepAlive ?? true);
	let menubarLinks = $state<MenubarLink[]>(stored.menubarLinks ?? []);

	function persist() {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({
			pagesViewMode,
			pagesPerPage,
			mediaViewMode,
			sidebarCollapsed,
			adminLanguage,
			keepAlive,
			menubarLinks,
		}));
	}

	return {
		get pagesViewMode() { return pagesViewMode; },
		set pagesViewMode(v: PagesViewMode) { pagesViewMode = v; persist(); },

		get pagesPerPage() { return pagesPerPage; },
		set pagesPerPage(v: number) { pagesPerPage = v; persist(); },

		get mediaViewMode() { return mediaViewMode; },
		set mediaViewMode(v: MediaViewMode) { mediaViewMode = v; persist(); },

		get sidebarCollapsed() { return sidebarCollapsed; },
		set sidebarCollapsed(v: boolean) { sidebarCollapsed = v; persist(); },

		get adminLanguage() { return adminLanguage; },
		set adminLanguage(v: string) { adminLanguage = v; persist(); },

		get keepAlive() { return keepAlive; },
		set keepAlive(v: boolean) { keepAlive = v; persist(); },

		get menubarLinks() { return menubarLinks; },
		set menubarLinks(v: MenubarLink[]) { menubarLinks = v; persist(); },
	};
}

export const prefs = createPreferencesStore();
