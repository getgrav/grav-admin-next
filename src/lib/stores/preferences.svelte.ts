const STORAGE_KEY = 'grav_admin_prefs';

export type PagesViewMode = 'tree' | 'list' | 'miller';

interface Preferences {
	pagesViewMode: PagesViewMode;
}

function loadStored(): Preferences {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? JSON.parse(raw) : {};
	} catch {
		return {} as Preferences;
	}
}

function createPreferencesStore() {
	const stored = loadStored();

	let pagesViewMode = $state<PagesViewMode>(stored.pagesViewMode ?? 'tree');

	function persist() {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ pagesViewMode }));
	}

	return {
		get pagesViewMode() { return pagesViewMode; },
		set pagesViewMode(v: PagesViewMode) { pagesViewMode = v; persist(); },
	};
}

export const prefs = createPreferencesStore();
