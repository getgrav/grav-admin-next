import { scopedKey } from '$lib/utils/scopedStorage';
import type {
	BrandingUrls,
	ColorMode,
	EditorMode,
	EditorKeymap,
	FontFamily,
	FontSize,
	PreferencesResponse,
	SiteBranding,
} from '$lib/api/endpoints/preferences';

/**
 * Tiny localStorage mirror of the last-resolved render values so we can paint
 * with the user's accent / font / logo on the first frame instead of
 * flashing the built-in Grav purple before the server fetch lands.
 *
 * This is render-only state. It is never written to the server and never
 * read as authoritative — `getPreferences()` always supersedes it once the
 * response arrives. If the cache disagrees with the server (e.g. the user
 * reset their prefs on another device), the flash is replaced by a single
 * settle once the server response arrives, which is the best we can do
 * without server-rendering the shell.
 */

const KEY = scopedKey('grav_admin_boot_cache');

export interface BootCache {
	colorMode: ColorMode;
	accentHue: number;
	accentSaturation: number;
	fontFamily: FontFamily;
	fontSize: FontSize;
	editorMode: EditorMode;
	editorKeymap: EditorKeymap;
	editorStickyToolbar: boolean;
	editorFixedHeight: number;
	branding: SiteBranding;
	brandingUrls: BrandingUrls;
}

export function saveBootCache(payload: PreferencesResponse): void {
	if (typeof localStorage === 'undefined') return;
	try {
		const cache: BootCache = {
			colorMode: payload.effective.colorMode,
			accentHue: payload.effective.accentHue,
			accentSaturation: payload.effective.accentSaturation,
			fontFamily: payload.effective.fontFamily,
			fontSize: payload.effective.fontSize,
			editorMode: payload.effective.editorMode,
			editorKeymap: payload.effective.editorKeymap,
			editorStickyToolbar: payload.effective.editorStickyToolbar,
			editorFixedHeight: payload.effective.editorFixedHeight,
			branding: payload.branding,
			brandingUrls: payload.branding_urls,
		};
		localStorage.setItem(KEY, JSON.stringify(cache));
	} catch {
		/* quota / disabled — non-fatal */
	}
}

export function loadBootCache(): BootCache | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object') return null;
		return parsed as BootCache;
	} catch {
		return null;
	}
}
