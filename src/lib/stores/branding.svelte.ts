import {
	saveSiteBranding as apiSaveSiteBranding,
	uploadBrandingLogo as apiUploadBrandingLogo,
	deleteBrandingLogo as apiDeleteBrandingLogo,
	type BrandingUrls,
	type BrandingVariant,
	type LogoMode,
	type PreferencesResponse,
	type SiteBranding,
} from '$lib/api/endpoints/preferences';
import { loadBootCache, saveBootCache } from './_bootCache';

/**
 * Pre-auth branding injected into `window.__GRAV_CONFIG__` by admin2.php so the
 * sign-in screen shows the configured logo/title before any API call or
 * localStorage cache exists (e.g. a fresh incognito window). Read defensively —
 * older admin2 builds don't inject it.
 */
function bootConfigBranding(): { branding?: Partial<SiteBranding>; brandingUrls?: Partial<BrandingUrls> } {
	if (typeof window === 'undefined') return {};
	const cfg = (window as unknown as {
		__GRAV_CONFIG__?: { branding?: Partial<SiteBranding>; brandingUrls?: Partial<BrandingUrls> };
	}).__GRAV_CONFIG__;
	return { branding: cfg?.branding, brandingUrls: cfg?.brandingUrls };
}

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
	// Seed precedence for site branding: the config admin2.php injects into
	// window.__GRAV_CONFIG__ wins, because it's read fresh from the server's
	// admin-next.yaml on every full page load — strictly more current than the
	// localStorage boot cache, which can lag a save made here or on another
	// device. The cache is only a fallback for standalone/dev mode where there's
	// no injected config. (Branding is site-wide, unlike the per-device theme
	// state the boot cache also carries.)
	const cache = loadBootCache();
	const boot = bootConfigBranding();
	const seedB = boot.branding ?? cache?.branding;
	const seedUrls = boot.brandingUrls ?? cache?.brandingUrls;

	let mode = $state<LogoMode>(seedB?.mode ?? 'default');
	let text = $state<string>(seedB?.text ?? 'Grav');
	let logoLight = $state<string>(seedB?.logoLight ?? '');
	let logoDark = $state<string>(seedB?.logoDark ?? '');
	let title = $state<string>(seedB?.title ?? '');
	let subtitle = $state<string>(seedB?.subtitle ?? '');
	let showPoweredBy = $state<boolean>(seedB?.showPoweredBy ?? true);
	let urlLight = $state<string>(seedUrls?.light ?? '');
	let urlDark = $state<string>(seedUrls?.dark ?? '');
	let urlFavicon = $state<string>(seedUrls?.favicon ?? '');
	let loaded = $state<boolean>(false);

	function applyPayload(payload: PreferencesResponse): void {
		const b = payload.branding;
		mode = b?.mode ?? 'default';
		text = b?.text ?? 'Grav';
		logoLight = b?.logoLight ?? '';
		logoDark = b?.logoDark ?? '';
		title = b?.title ?? '';
		subtitle = b?.subtitle ?? '';
		showPoweredBy = b?.showPoweredBy ?? true;
		urlLight = payload.branding_urls?.light ?? '';
		urlDark = payload.branding_urls?.dark ?? '';
		urlFavicon = payload.branding_urls?.favicon ?? '';
		loaded = true;
	}

	// Apply a server payload to live state AND refresh the boot cache. Every
	// mutation path goes through here so the cache never lags a save — otherwise
	// a saved title/logo could still read stale from the cache on the next full
	// reload (the symptom behind "custom title not kept on refresh").
	function applyAndCache(payload: PreferencesResponse): PreferencesResponse {
		applyPayload(payload);
		saveBootCache(payload);
		return payload;
	}

	function init(payload: PreferencesResponse): void {
		applyAndCache(payload);
	}

	async function save(patch: Partial<SiteBranding>): Promise<PreferencesResponse> {
		return applyAndCache(await apiSaveSiteBranding(patch));
	}

	async function uploadLogo(variant: BrandingVariant, file: File): Promise<PreferencesResponse> {
		return applyAndCache(await apiUploadBrandingLogo(variant, file));
	}

	async function deleteLogo(variant: BrandingVariant): Promise<PreferencesResponse> {
		return applyAndCache(await apiDeleteBrandingLogo(variant));
	}

	return {
		get mode() { return mode; },
		get text() { return text; },
		get logoLight() { return logoLight; },
		get logoDark() { return logoDark; },
		get title() { return title; },
		get subtitle() { return subtitle; },
		get showPoweredBy() { return showPoweredBy; },
		get urlLight() { return urlLight; },
		get urlDark() { return urlDark; },
		get urlFavicon() { return urlFavicon; },
		get loaded() { return loaded; },
		init,
		save,
		uploadLogo,
		deleteLogo,
	};
}

export const branding = createBrandingStore();
