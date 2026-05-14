import {
	saveSiteBranding as apiSaveSiteBranding,
	uploadBrandingLogo as apiUploadBrandingLogo,
	deleteBrandingLogo as apiDeleteBrandingLogo,
	type LogoMode,
	type LogoVariant,
	type PreferencesResponse,
	type SiteBranding,
} from '$lib/api/endpoints/preferences';
import { loadBootCache, saveBootCache } from './_bootCache';

/**
 * Site-wide branding state (Tier A). Read-only for non-super-admin users;
 * super-admins can modify via the `save`/`uploadLogo`/`deleteLogo` helpers,
 * which round-trip through the API plugin and the resolver normalizes
 * before persisting to user/config/admin-next.yaml.
 *
 * Logo URLs are server-resolved (`branding_urls.light` / `.dark`) so the
 * client never has to know about the storage filename scheme — it just
 * uses the URL the server hands back. Empty URL = render built-in Grav SVG.
 */
function createBrandingStore() {
	const cache = loadBootCache();
	let mode = $state<LogoMode>(cache?.branding?.mode ?? 'default');
	let text = $state<string>(cache?.branding?.text ?? 'Grav');
	let logoLight = $state<string>(cache?.branding?.logoLight ?? '');
	let logoDark = $state<string>(cache?.branding?.logoDark ?? '');
	let urlLight = $state<string>(cache?.brandingUrls?.light ?? '');
	let urlDark = $state<string>(cache?.brandingUrls?.dark ?? '');
	let loaded = $state<boolean>(false);

	function applyPayload(payload: PreferencesResponse): void {
		const b = payload.branding ?? { mode: 'default', text: 'Grav', logoLight: '', logoDark: '' };
		mode = b.mode;
		text = b.text;
		logoLight = b.logoLight;
		logoDark = b.logoDark;
		urlLight = payload.branding_urls?.light ?? '';
		urlDark = payload.branding_urls?.dark ?? '';
		loaded = true;
	}

	function init(payload: PreferencesResponse): void {
		applyPayload(payload);
		saveBootCache(payload);
	}

	async function save(patch: Partial<SiteBranding>): Promise<PreferencesResponse> {
		const resp = await apiSaveSiteBranding(patch);
		applyPayload(resp);
		return resp;
	}

	async function uploadLogo(variant: LogoVariant, file: File): Promise<PreferencesResponse> {
		const resp = await apiUploadBrandingLogo(variant, file);
		applyPayload(resp);
		return resp;
	}

	async function deleteLogo(variant: LogoVariant): Promise<PreferencesResponse> {
		const resp = await apiDeleteBrandingLogo(variant);
		applyPayload(resp);
		return resp;
	}

	return {
		get mode() { return mode; },
		get text() { return text; },
		get logoLight() { return logoLight; },
		get logoDark() { return logoDark; },
		get urlLight() { return urlLight; },
		get urlDark() { return urlDark; },
		get loaded() { return loaded; },
		init,
		save,
		uploadLogo,
		deleteLogo,
	};
}

export const branding = createBrandingStore();
