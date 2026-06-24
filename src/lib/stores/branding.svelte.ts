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
	// Seed precedence: localStorage boot cache (last-resolved values) first, then
	// the pre-auth config injected by admin2.php, then built-in defaults. The
	// boot cache wins when present because it reflects this device's last server
	// response; the injected config only matters on a first/cache-less visit.
	const cache = loadBootCache();
	const boot = bootConfigBranding();
	const seedB = cache?.branding ?? boot.branding;
	const seedUrls = cache?.brandingUrls ?? boot.brandingUrls;

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

	function init(payload: PreferencesResponse): void {
		applyPayload(payload);
		saveBootCache(payload);
	}

	async function save(patch: Partial<SiteBranding>): Promise<PreferencesResponse> {
		const resp = await apiSaveSiteBranding(patch);
		applyPayload(resp);
		return resp;
	}

	async function uploadLogo(variant: BrandingVariant, file: File): Promise<PreferencesResponse> {
		const resp = await apiUploadBrandingLogo(variant, file);
		applyPayload(resp);
		return resp;
	}

	async function deleteLogo(variant: BrandingVariant): Promise<PreferencesResponse> {
		const resp = await apiDeleteBrandingLogo(variant);
		applyPayload(resp);
		return resp;
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
