import { scopedKey } from '$lib/utils/scopedStorage';
import { queueUserPatch, onPreferencesUpdated } from './_serverSync';
import { loadBootCache, saveBootCache } from './_bootCache';
import { normalizeLang } from '$lib/i18n/normalize';
import {
	getPreferences,
	resetUserPreferences as apiResetUserPreferences,
	type AccountsViewMode,
	type EffectivePreferences,
	type FontFamily,
	type FontSize,
	type EditorMode,
	type EditorKeymap,
	type MenubarLink,
	type PagesViewMode,
	type PreferenceValues,
	type PreferencesResponse,
	type SiteSettings,
	type UserPreferencesPayload,
} from '$lib/api/endpoints/preferences';

export type {
	AccountsViewMode,
	ColorMode,
	EditorMode,
	EditorKeymap,
	FontFamily,
	FontSize,
	LogoMode,
	MenubarLink,
	PagesViewMode,
} from '$lib/api/endpoints/preferences';

/**
 * Device-local UI state (Tier D) — never synced to the server. Saved under
 * a separate localStorage namespace so the old server-bound keys (now under
 * `grav_admin_prefs::*`) can be detected and migrated independently.
 */
const LOCAL_STORAGE_KEY = scopedKey('grav_admin_local');

export interface FontOption {
	value: FontFamily;
	label: string;
	stack: string;
}

export const FONT_OPTIONS: FontOption[] = [
	{ value: 'google-sans',  label: 'Google Sans',  stack: "'Google Sans', ui-sans-serif, system-ui, -apple-system, sans-serif" },
	{ value: 'inter',        label: 'Inter',        stack: "'Inter Variable', 'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif" },
	{ value: 'public-sans',  label: 'Public Sans',  stack: "'Public Sans Variable', 'Public Sans', ui-sans-serif, system-ui, -apple-system, sans-serif" },
	{ value: 'nunito-sans',  label: 'Nunito Sans',  stack: "'Nunito Sans Variable', 'Nunito Sans', ui-sans-serif, system-ui, -apple-system, sans-serif" },
	{ value: 'jost',         label: 'Jost',         stack: "'Jost Variable', 'Jost', ui-sans-serif, system-ui, -apple-system, sans-serif" },
];

export interface FontSizeOption {
	value: FontSize;
	label: string;
	rootSize: string;
}

export const FONT_SIZE_OPTIONS: FontSizeOption[] = [
	{ value: 'small',  label: 'Small',   rootSize: '14px' },
	{ value: 'normal', label: 'Normal',  rootSize: '16px' },
	{ value: 'large',  label: 'Large',   rootSize: '18px' },
	{ value: 'xlarge', label: 'X-Large', rootSize: '20px' },
];

function fontStack(value: FontFamily): string {
	return (FONT_OPTIONS.find(f => f.value === value) ?? FONT_OPTIONS[0]).stack;
}

function applyFont(value: FontFamily): void {
	if (typeof document === 'undefined') return;
	document.documentElement.style.setProperty('--font-sans', fontStack(value));
}

function rootSizeForValue(value: FontSize): string {
	return (FONT_SIZE_OPTIONS.find(o => o.value === value) ?? FONT_SIZE_OPTIONS[1]).rootSize;
}

function applyFontSize(value: FontSize): void {
	if (typeof document === 'undefined') return;
	document.documentElement.style.setProperty('--app-font-size', rootSizeForValue(value));
}

export type MediaViewMode = 'grid' | 'list';

/** Chunk size used by the pages list/columns/tree views for lazy loading. */
export const PAGES_CHUNK_SIZE_OPTIONS = [50, 100, 250, 500, 1000] as const;
export type PagesChunkSize = (typeof PAGES_CHUNK_SIZE_OPTIONS)[number];

interface LocalState {
	mediaViewMode: MediaViewMode;
	sidebarCollapsed: boolean;
	pageSidebarCollapsed: boolean;
	pagesChunkSize: PagesChunkSize;
}

const LOCAL_DEFAULTS: LocalState = {
	mediaViewMode: 'grid',
	sidebarCollapsed: false,
	pageSidebarCollapsed: false,
	pagesChunkSize: 100,
};

function loadLocal(): LocalState {
	try {
		const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
		if (!raw) return { ...LOCAL_DEFAULTS };
		const parsed = JSON.parse(raw);
		return { ...LOCAL_DEFAULTS, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
	} catch {
		return { ...LOCAL_DEFAULTS };
	}
}

/**
 * Server-side baseline used when neither user nor site has set a value.
 * Mirrors PreferencesResolver::defaultPreferences() / defaultSiteSettings().
 */
const BUILTIN_DEFAULTS: EffectivePreferences = {
	// Tier B
	colorMode: '',
	accentHue: 271,
	accentSaturation: 91,
	fontFamily: 'google-sans',
	fontSize: 'normal',
	editorMode: 'normal',
	editorKeymap: 'default',
	editorStickyToolbar: true,
	editorFixedHeight: 0,
	adminLanguage: 'en-US',
	pagesPerPage: 20,
	pagesViewMode: 'tree',
	usersViewMode: 'cards',
	groupsViewMode: 'cards',
	pluginsViewMode: 'cards',
	themesViewMode: 'cards',
	// Tier A2 (site-only behavioral)
	autoSaveEnabled: false,
	autoSaveToolbarUndo: true,
	autoSaveBatchWindowMs: 0,
	collabEnabled: true,
	menubarLinks: [],
};

function createPreferencesStore() {
	const local = loadLocal();
	const cache = loadBootCache();

	// ── Tier B: server-synced, user-overridable ────────────────────────────
	let fontFamily = $state<FontFamily>(cache?.fontFamily ?? BUILTIN_DEFAULTS.fontFamily);
	let fontSize = $state<FontSize>(cache?.fontSize ?? BUILTIN_DEFAULTS.fontSize);
	let editorMode = $state<EditorMode>(cache?.editorMode ?? BUILTIN_DEFAULTS.editorMode);
	let editorKeymap = $state<EditorKeymap>(cache?.editorKeymap ?? BUILTIN_DEFAULTS.editorKeymap);
	let editorStickyToolbar = $state<boolean>(cache?.editorStickyToolbar ?? BUILTIN_DEFAULTS.editorStickyToolbar);
	let editorFixedHeight = $state<number>(cache?.editorFixedHeight ?? BUILTIN_DEFAULTS.editorFixedHeight);
	let adminLanguage = $state<string>(BUILTIN_DEFAULTS.adminLanguage);
	let pagesPerPage = $state<number>(BUILTIN_DEFAULTS.pagesPerPage);
	let pagesViewMode = $state<PagesViewMode>(BUILTIN_DEFAULTS.pagesViewMode);
	let usersViewMode = $state<AccountsViewMode>(BUILTIN_DEFAULTS.usersViewMode);
	let groupsViewMode = $state<AccountsViewMode>(BUILTIN_DEFAULTS.groupsViewMode);
	let pluginsViewMode = $state<AccountsViewMode>(BUILTIN_DEFAULTS.pluginsViewMode);
	let themesViewMode = $state<AccountsViewMode>(BUILTIN_DEFAULTS.themesViewMode);

	// ── Tier A2: site-only behavioral — read-only mirrors of `effective` ──
	// No setters; admins modify these via the Site Defaults editor.
	let autoSaveEnabled = $state<boolean>(BUILTIN_DEFAULTS.autoSaveEnabled);
	let autoSaveToolbarUndo = $state<boolean>(BUILTIN_DEFAULTS.autoSaveToolbarUndo);
	let autoSaveBatchWindowMs = $state<number>(BUILTIN_DEFAULTS.autoSaveBatchWindowMs);
	let collabEnabled = $state<boolean>(BUILTIN_DEFAULTS.collabEnabled);
	let menubarLinks = $state<MenubarLink[]>([...BUILTIN_DEFAULTS.menubarLinks]);

	// ── Tier D: device-local (no server round-trip) ────────────────────────
	let mediaViewMode = $state<MediaViewMode>(local.mediaViewMode);
	let sidebarCollapsed = $state<boolean>(local.sidebarCollapsed);
	let pageSidebarCollapsed = $state<boolean>(local.pageSidebarCollapsed);
	let pagesChunkSize = $state<PagesChunkSize>(local.pagesChunkSize);

	// ── Server payload mirrors (read-only via getters) ─────────────────────
	let siteDefaults = $state<Partial<PreferenceValues>>({});
	let siteSettings = $state<SiteSettings>({ ...BUILTIN_DEFAULTS } as SiteSettings);
	let userOverrides = $state<UserPreferencesPayload>({});
	let canEditSite = $state<boolean>(false);
	let loaded = $state<boolean>(false);

	applyFont(fontFamily);
	applyFontSize(fontSize);

	function persistLocal(): void {
		try {
			localStorage.setItem(
				LOCAL_STORAGE_KEY,
				JSON.stringify({ mediaViewMode, sidebarCollapsed, pageSidebarCollapsed, pagesChunkSize }),
			);
		} catch {
			/* quota / unavailable — fine */
		}
	}

	function applyEffective(eff: EffectivePreferences): void {
		// Tier B
		fontFamily = eff.fontFamily;
		fontSize = eff.fontSize;
		editorMode = eff.editorMode;
		editorKeymap = eff.editorKeymap;
		editorStickyToolbar = eff.editorStickyToolbar;
		editorFixedHeight = eff.editorFixedHeight;
		adminLanguage = normalizeLang(eff.adminLanguage);
		pagesPerPage = eff.pagesPerPage;
		pagesViewMode = eff.pagesViewMode;
		usersViewMode = eff.usersViewMode;
		groupsViewMode = eff.groupsViewMode;
		pluginsViewMode = eff.pluginsViewMode;
		themesViewMode = eff.themesViewMode;
		// Tier A2
		autoSaveEnabled = eff.autoSaveEnabled;
		autoSaveToolbarUndo = eff.autoSaveToolbarUndo;
		autoSaveBatchWindowMs = eff.autoSaveBatchWindowMs;
		collabEnabled = eff.collabEnabled;
		menubarLinks = Array.isArray(eff.menubarLinks) ? eff.menubarLinks : [];
		applyFont(fontFamily);
		applyFontSize(fontSize);
	}

	function init(payload: PreferencesResponse): void {
		applyEffective(payload.effective);
		siteDefaults = payload.site ?? {};
		siteSettings = payload.site_settings ?? ({ ...BUILTIN_DEFAULTS } as SiteSettings);
		userOverrides = payload.user ?? {};
		canEditSite = !!payload.can_edit_site;
		loaded = true;
		saveBootCache(payload);
	}

	// Echo server-side normalization back into local state. We don't apply
	// effective values blindly here because the user may have typed something
	// in between debounce flushes — only sync the `site` / `user` mirrors.
	onPreferencesUpdated((payload) => {
		siteDefaults = payload.site ?? {};
		siteSettings = payload.site_settings ?? siteSettings;
		userOverrides = payload.user ?? {};
	});

	async function reload(): Promise<void> {
		const payload = await getPreferences();
		init(payload);
	}

	function patchUser(key: keyof PreferenceValues, value: unknown): void {
		queueUserPatch(key as string, value);
		if (value === null) {
			const next = { ...userOverrides };
			delete (next as Record<string, unknown>)[key as string];
			userOverrides = next;
		} else {
			userOverrides = { ...userOverrides, [key]: value };
		}
	}

	function effectiveDefault<K extends keyof PreferenceValues>(key: K): PreferenceValues[K] {
		const site = siteDefaults as Partial<PreferenceValues>;
		if (site[key] !== undefined && site[key] !== null) {
			return site[key] as PreferenceValues[K];
		}
		return BUILTIN_DEFAULTS[key];
	}

	async function resetToSiteDefault(key: keyof PreferenceValues): Promise<void> {
		patchUser(key, null);
		const fallback = effectiveDefault(key);
		switch (key) {
			case 'fontFamily': fontFamily = fallback as FontFamily; applyFont(fontFamily); break;
			case 'fontSize': fontSize = fallback as FontSize; applyFontSize(fontSize); break;
			case 'editorMode': editorMode = fallback as EditorMode; break;
			case 'editorKeymap': editorKeymap = fallback as EditorKeymap; break;
			case 'editorStickyToolbar': editorStickyToolbar = fallback as boolean; break;
			case 'editorFixedHeight': editorFixedHeight = fallback as number; break;
			case 'adminLanguage': adminLanguage = fallback as string; break;
			case 'pagesPerPage': pagesPerPage = fallback as number; break;
			case 'pagesViewMode': pagesViewMode = fallback as PagesViewMode; break;
			case 'usersViewMode': usersViewMode = fallback as AccountsViewMode; break;
			case 'groupsViewMode': groupsViewMode = fallback as AccountsViewMode; break;
			case 'pluginsViewMode': pluginsViewMode = fallback as AccountsViewMode; break;
			case 'themesViewMode': themesViewMode = fallback as AccountsViewMode; break;
			// colorMode / accentHue / accentSaturation live in the theme store.
			default: break;
		}
	}

	async function resetAllToSiteDefaults(): Promise<PreferencesResponse> {
		const payload = await apiResetUserPreferences();
		init(payload);
		return payload;
	}

	function isUserOverridden(key: keyof PreferenceValues): boolean {
		const v = (userOverrides as Record<string, unknown>)[key as string];
		return v !== undefined && v !== null;
	}

	return {
		// ── Tier B: server-synced, user-overridable ────────────────────────
		get fontFamily() { return fontFamily; },
		set fontFamily(v: FontFamily) { fontFamily = v; applyFont(v); patchUser('fontFamily', v); },

		get fontSize() { return fontSize; },
		set fontSize(v: FontSize) { fontSize = v; applyFontSize(v); patchUser('fontSize', v); },

		get editorMode() { return editorMode; },
		set editorMode(v: EditorMode) { editorMode = v; patchUser('editorMode', v); },

		get editorKeymap() { return editorKeymap; },
		set editorKeymap(v: EditorKeymap) { editorKeymap = v; patchUser('editorKeymap', v); },

		get editorStickyToolbar() { return editorStickyToolbar; },
		set editorStickyToolbar(v: boolean) { editorStickyToolbar = v; patchUser('editorStickyToolbar', v); },

		get editorFixedHeight() { return editorFixedHeight; },
		set editorFixedHeight(v: number) { editorFixedHeight = v; patchUser('editorFixedHeight', v); },

		get adminLanguage() { return adminLanguage; },
		set adminLanguage(v: string) {
			const canonical = normalizeLang(v);
			adminLanguage = canonical;
			patchUser('adminLanguage', canonical);
		},

		get pagesPerPage() { return pagesPerPage; },
		set pagesPerPage(v: number) { pagesPerPage = v; patchUser('pagesPerPage', v); },

		get pagesViewMode() { return pagesViewMode; },
		set pagesViewMode(v: PagesViewMode) { pagesViewMode = v; patchUser('pagesViewMode', v); },

		get usersViewMode() { return usersViewMode; },
		set usersViewMode(v: AccountsViewMode) { usersViewMode = v; patchUser('usersViewMode', v); },

		get groupsViewMode() { return groupsViewMode; },
		set groupsViewMode(v: AccountsViewMode) { groupsViewMode = v; patchUser('groupsViewMode', v); },

		get pluginsViewMode() { return pluginsViewMode; },
		set pluginsViewMode(v: AccountsViewMode) { pluginsViewMode = v; patchUser('pluginsViewMode', v); },

		get themesViewMode() { return themesViewMode; },
		set themesViewMode(v: AccountsViewMode) { themesViewMode = v; patchUser('themesViewMode', v); },

		// ── Tier A2: site-only — read-only ─────────────────────────────────
		get autoSaveEnabled() { return autoSaveEnabled; },
		get autoSaveToolbarUndo() { return autoSaveToolbarUndo; },
		get autoSaveBatchWindowMs() { return autoSaveBatchWindowMs; },
		get collabEnabled() { return collabEnabled; },
		get menubarLinks() { return menubarLinks; },

		// ── Tier D: device-local ───────────────────────────────────────────
		get mediaViewMode() { return mediaViewMode; },
		set mediaViewMode(v: MediaViewMode) { mediaViewMode = v; persistLocal(); },

		get sidebarCollapsed() { return sidebarCollapsed; },
		set sidebarCollapsed(v: boolean) { sidebarCollapsed = v; persistLocal(); },

		get pageSidebarCollapsed() { return pageSidebarCollapsed; },
		set pageSidebarCollapsed(v: boolean) { pageSidebarCollapsed = v; persistLocal(); },

		get pagesChunkSize() { return pagesChunkSize; },
		set pagesChunkSize(v: PagesChunkSize) { pagesChunkSize = v; persistLocal(); },

		// ── Server-payload mirrors / metadata ──────────────────────────────
		get siteDefaults() { return siteDefaults; },
		get siteSettings() { return siteSettings; },
		get userOverrides() { return userOverrides; },
		get canEditSite() { return canEditSite; },
		get loaded() { return loaded; },

		// ── Lifecycle ──────────────────────────────────────────────────────
		init,
		reload,
		resetToSiteDefault,
		resetAllToSiteDefaults,
		isUserOverridden,
		effectiveDefault,
	};
}

export const prefs = createPreferencesStore();
