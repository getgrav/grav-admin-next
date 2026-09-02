import { api } from '../client';

export type ColorMode = '' | 'light' | 'dark';
export type FontFamily = 'inter' | 'google-sans' | 'public-sans' | 'nunito-sans' | 'jost' | 'albert-sans';
export type FontSize = 'small' | 'normal' | 'large' | 'xlarge';
export type EditorMode = 'normal' | 'expert';
export type EditorKeymap = 'default' | 'vim';
export type LogoMode = 'default' | 'text' | 'custom';
export type LogoVariant = 'light' | 'dark';
/** Upload/delete variants: the two logo slots plus the custom favicon. */
export type BrandingVariant = 'light' | 'dark' | 'favicon';
export type PagesViewMode = 'tree' | 'list' | 'miller';
export type AccountsViewMode = 'cards' | 'table';
/** Where the admin goes after saving a Flex object. '' = follow the blueprint. */
export type FlexAfterSave = '' | 'create-new' | 'edit' | 'list';

export interface MenubarLink {
	label: string;
	url: string;
	icon?: string;
	external?: boolean;
}

export interface SiteBranding {
	mode: LogoMode;
	text: string;
	logoLight: string;
	logoDark: string;
	/** Custom sign-in heading + browser-tab title. Empty = built-in "Grav Admin". */
	title: string;
	/** Custom sign-in subtitle. Empty = built-in copy. */
	subtitle: string;
	/** Show the "Powered by Grav CMS" line on the login/setup screens. */
	showPoweredBy: boolean;
	/** Custom favicon filename. Empty = the generated accent-coloured favicon. */
	favicon: string;
}

export interface BrandingUrls {
	light: string;
	dark: string;
	favicon: string;
}

/** Tier B — keys the user is allowed to override. */
export interface PreferenceValues {
	colorMode: ColorMode;
	accentHue: number;
	accentSaturation: number;
	fontFamily: FontFamily;
	fontSize: FontSize;
	editorMode: EditorMode;
	editorKeymap: EditorKeymap;
	editorStickyToolbar: boolean;
	editorFixedHeight: number;
	adminLanguage: string;
	pagesPerPage: number;
	pagesViewMode: PagesViewMode;
	usersViewMode: AccountsViewMode;
	groupsViewMode: AccountsViewMode;
	pluginsViewMode: AccountsViewMode;
	themesViewMode: AccountsViewMode;
	flexAfterSave: FlexAfterSave;
}

/** Tier A2 — site-only behavioral settings (not per-user). */
export interface SiteSettings {
	autoSaveEnabled: boolean;
	autoSaveToolbarUndo: boolean;
	autoSaveBatchWindowMs: number;
	collabEnabled: boolean;
	menubarLinks: MenubarLink[];
}

/** Merged Tier B + A2 — what every consumer reads at runtime. */
export interface EffectivePreferences extends PreferenceValues, SiteSettings {}

export type UserPreferencesPayload = Partial<PreferenceValues>;

export interface PreferencesResponse {
	branding: SiteBranding;
	branding_urls: BrandingUrls;
	site: Partial<PreferenceValues>;
	site_settings: SiteSettings;
	user: UserPreferencesPayload;
	effective: EffectivePreferences;
	can_edit_site: boolean;
}

export async function getPreferences(): Promise<PreferencesResponse> {
	return api.get<PreferencesResponse>('/admin-next/preferences');
}

/**
 * PATCH user overrides. Send `null` for a key to remove that override
 * (i.e. fall back to the site default). Omit a key to leave it alone.
 */
export async function saveUserPreferences(
	payload: Record<string, unknown>,
): Promise<PreferencesResponse> {
	return api.patch<PreferencesResponse>('/admin-next/preferences/user', payload);
}

/** Clears the user's entire override block; the SPA reseeds from `effective`. */
export async function resetUserPreferences(): Promise<PreferencesResponse> {
	return api.delete<PreferencesResponse>('/admin-next/preferences/user');
}

/**
 * Super-admin: write site defaults. Accepts both Tier B keys (overridable
 * per-user, e.g. accent) and Tier A2 keys (site-only behavioral, e.g.
 * autoSaveEnabled). The backend routes each key to its own yaml destination.
 */
export async function saveSitePreferences(
	payload: Partial<PreferenceValues> & Partial<SiteSettings>,
): Promise<PreferencesResponse> {
	return api.patch<PreferencesResponse>('/admin-next/preferences/site', payload);
}

/** Super-admin: write site branding (mode/text + logo paths). */
export async function saveSiteBranding(
	payload: Partial<SiteBranding>,
): Promise<PreferencesResponse> {
	return api.patch<PreferencesResponse>('/admin-next/branding', payload);
}

/** Super-admin: upload a logo or favicon file (variant = light, dark, or favicon). */
export async function uploadBrandingLogo(
	variant: BrandingVariant,
	file: File,
): Promise<PreferencesResponse> {
	return api.uploadFile<PreferencesResponse>(`/admin-next/branding/logo?variant=${variant}`, file, {
		fieldName: 'file',
	});
}

/** Super-admin: delete a logo or favicon file (variant = light, dark, or favicon). */
export async function deleteBrandingLogo(variant: BrandingVariant): Promise<PreferencesResponse> {
	return api.delete<PreferencesResponse>(`/admin-next/branding/logo?variant=${variant}`);
}
