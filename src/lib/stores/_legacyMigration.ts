import {
	saveUserPreferences,
	type PreferencesResponse,
} from '$lib/api/endpoints/preferences';

/**
 * One-time migration: lift Tier B/C values out of the legacy localStorage
 * keys (`grav_admin_prefs::*`, `grav_admin_theme::*`) and push them to the
 * server as user overrides. Tier D values stay local under the new
 * `grav_admin_local::*` namespace; see preferences.svelte.ts.
 *
 * Runs only when:
 *   - the user is authenticated (we have a server to push to),
 *   - the legacy keys actually exist (skip on fresh installs),
 *   - the server has no `user` overrides yet (don't trample a value
 *     they may have set on another device).
 *
 * On success, clears the legacy keys so the migration doesn't re-run.
 */
export async function migrateLegacyPreferences(payload: PreferencesResponse): Promise<PreferencesResponse | null> {
	if (typeof localStorage === 'undefined') return null;
	if (payload.user && Object.keys(payload.user).length > 0) return null;

	const prefsKey = findLegacyKey('grav_admin_prefs');
	const themeKey = findLegacyKey('grav_admin_theme');
	if (!prefsKey && !themeKey) return null;

	const patch: Record<string, unknown> = {};

	if (prefsKey) {
		try {
			const raw = JSON.parse(localStorage.getItem(prefsKey) ?? '{}');
			// Tier B keys only — Tier A2 (auto-save, collab, menubar) is now
			// site-only and would be rejected by the backend whitelist. Users
			// upgrading from a build that had those as personal preferences
			// will see the site default for those after migration; the admin
			// can reseed the site-wide values in Site Defaults.
			copyIfSet(raw, patch, [
				'editorMode',
				'fontFamily',
				'fontSize',
				'adminLanguage',
				'pagesPerPage',
				'pagesViewMode',
			]);
		} catch {
			/* corrupt legacy — skip */
		}
	}

	if (themeKey) {
		try {
			const raw = JSON.parse(localStorage.getItem(themeKey) ?? '{}');
			if (raw.colorMode === 'light' || raw.colorMode === 'dark') {
				patch.colorMode = raw.colorMode;
			}
			if (typeof raw.accentHue === 'number') {
				patch.accentHue = raw.accentHue;
			}
			if (typeof raw.accentSaturation === 'number') {
				patch.accentSaturation = raw.accentSaturation;
			}
		} catch {
			/* corrupt legacy — skip */
		}
	}

	if (Object.keys(patch).length === 0) {
		clearLegacy(prefsKey, themeKey);
		return null;
	}

	try {
		const resp = await saveUserPreferences(patch);
		clearLegacy(prefsKey, themeKey);
		return resp;
	} catch {
		// Leave legacy in place so we retry on next boot.
		return null;
	}
}

function findLegacyKey(prefix: string): string | null {
	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i);
		if (key && (key === prefix || key.startsWith(prefix + '::'))) {
			return key;
		}
	}
	return null;
}

function clearLegacy(...keys: Array<string | null>): void {
	for (const k of keys) {
		if (k) {
			try { localStorage.removeItem(k); } catch { /* ignore */ }
		}
	}
}

function copyIfSet<T extends Record<string, unknown>>(src: Record<string, unknown>, dest: T, keys: string[]): void {
	for (const key of keys) {
		if (src[key] !== undefined && src[key] !== null) {
			(dest as Record<string, unknown>)[key] = src[key];
		}
	}
}
