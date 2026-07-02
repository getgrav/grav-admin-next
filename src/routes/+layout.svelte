<script lang="ts">
	import './layout.css';
	import '@fortawesome/fontawesome-free/css/all.min.css';
	// Self-hosted alternate UI fonts (user-selectable in Settings). Bundled at
	// build time so the admin needs no network access — see getgrav/grav-plugin-admin2#97.
	// Google Sans (the default) is self-hosted via @font-face in layout.css.
	import '@fontsource-variable/inter/wght.css';
	import '@fontsource-variable/public-sans/wght.css';
	import '@fontsource-variable/public-sans/wght-italic.css';
	import '@fontsource-variable/nunito-sans/wght.css';
	import '@fontsource-variable/nunito-sans/wght-italic.css';
	import '@fontsource-variable/jost/wght.css';
	import '@fontsource-variable/jost/wght-italic.css';
	import { page, updated } from '$app/state';
	import { goto, beforeNavigate } from '$app/navigation';
	import { base } from '$app/paths';
	import { auth } from '$lib/stores/auth.svelte';
	import { authSession } from '$lib/stores/auth-session.svelte';
	import { theme } from '$lib/stores/theme.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { contentLang } from '$lib/stores/contentLang.svelte';
	import { customFieldRegistry } from '$lib/stores/customFields.svelte';
	import { invalidations } from '$lib/stores/invalidation.svelte';
	import { prefs } from '$lib/stores/preferences.svelte';
	import { branding } from '$lib/stores/branding.svelte';
	import { getPreferences } from '$lib/api/endpoints/preferences';
	import { migrateLegacyPreferences } from '$lib/stores/_legacyMigration';
	import { hasPendingSync } from '$lib/stores/_serverSync';
	import { hasUnsavedChanges } from '$lib/utils/unsaved-guard.svelte';
	import { generateFavicon } from '$lib/utils/favicon';
	import AppShell from '$lib/components/AppShell.svelte';
	import GlobalDialogs from '$lib/components/ui/GlobalDialogs.svelte';
	import PluginModal from '$lib/components/ui/PluginModal.svelte';
	import { dialogs } from '$lib/stores/dialogs.svelte';
	import { modals } from '$lib/stores/modals.svelte';
	import { Toaster, toast } from 'svelte-sonner';
	import { Loader2 } from 'lucide-svelte';

	let { children } = $props();

	const isAuthPage = $derived(
		page.url.pathname === `${base}/login` ||
		page.url.pathname === `${base}/forgot` ||
		page.url.pathname === `${base}/reset` ||
		page.url.pathname === `${base}/invite` ||
		page.url.pathname === `${base}/setup` ||
		page.url.pathname === `${base}/oauth-callback`
	);
	// Boot-time silent re-auth. The access token is short-lived (jwt_expiry,
	// 1h by default) while the refresh token lasts days. If the browser was
	// closed past the access-token lifetime and reopened, `isAuthenticated` is
	// false on boot even though a perfectly valid refresh token is still in
	// localStorage. Without recovering here the guard below would bounce the
	// user straight to /login — the symptom reported in admin2 #55 ("ignores
	// session timeout, makes me log in again"). So before deciding the session
	// is dead, try one refresh; only redirect if it fails (or nothing to
	// recover from). `authSession.start()` takes over once AppShell mounts.
	let bootResolving = $state(false);
	let bootAttempted = false;

	$effect(() => {
		if (bootAttempted || isAuthPage) return;
		bootAttempted = true;
		if (!auth.isAuthenticated && auth.canRefresh) {
			bootResolving = true;
			void authSession.performRefresh().finally(() => { bootResolving = false; });
		}
	});

	const needsAuth = $derived(!isAuthPage && !auth.isAuthenticated && !bootResolving);

	// Favicon: a custom uploaded favicon (resolved to an absolute URL the same
	// way BrandLogo resolves logo paths) takes precedence over the generated
	// accent-coloured one. Applies pre-auth too — the branding store seeds from
	// window.__GRAV_CONFIG__ on a cache-less visit.
	const faviconHref = $derived.by(() => {
		const url = branding.urlFavicon;
		if (url) {
			if (url.startsWith('http://') || url.startsWith('https://')) return url;
			const server = typeof window !== 'undefined'
				? ((window as unknown as { __GRAV_CONFIG__?: { serverUrl?: string } }).__GRAV_CONFIG__?.serverUrl ?? '')
				: '';
			return server + url;
		}
		return generateFavicon(theme.accentHue, theme.accentSaturation, theme.isDark);
	});

	// Custom app title: route components set browser-tab titles like
	// "Dashboard — Grav Admin" via <svelte:head>. When the operator has set a
	// branding title, swap the "Grav Admin" token for it.
	//
	// The swap is non-destructive: we remember the route's canonical title (the
	// one still carrying the "Grav Admin" token) separately from what we write
	// to the tab. Mutating document.title in place would erase the token, so a
	// later change to the branding title would have nothing left to match and
	// the tab would stay pinned to the previously-applied custom value.
	let canonicalTitle = $state('');

	// Capture the canonical route title. A MutationObserver (rather than
	// reacting to each route) catches it regardless of effect ordering. We only
	// record titles that still carry the token, so our own swapped output below
	// never echoes back into the base and there's no feedback loop.
	//
	// We observe <head> rather than the <title> element itself: this effect runs
	// once at mount, and on a cold load (e.g. incognito) the route's <title> may
	// not exist yet. Watching the subtree of <head> catches the title element
	// being added later as well as every subsequent text change, so the capture
	// no longer races route rendering.
	$effect(() => {
		if (typeof document === 'undefined') return;
		const headEl = document.head;
		if (!headEl) return;
		const capture = () => {
			if (document.title.includes('Grav Admin')) canonicalTitle = document.title;
		};
		capture();
		const obs = new MutationObserver(capture);
		obs.observe(headEl, { childList: true, characterData: true, subtree: true });
		return () => obs.disconnect();
	});

	// Apply the branding title to the captured canonical base. Re-runs whenever
	// the route title or the branding title changes — always swapping from the
	// preserved base rather than the live (already-swapped) tab text.
	$effect(() => {
		if (typeof document === 'undefined') return;
		const base = canonicalTitle;
		if (!base) return;
		const custom = branding.title.trim();
		const next = custom ? base.replaceAll('Grav Admin', custom) : base;
		if (next !== document.title) document.title = next;
	});

	$effect(() => {
		if (needsAuth) {
			const returnTo = page.url.pathname + page.url.search + page.url.hash;
			goto(`${base}/login?returnTo=${encodeURIComponent(returnTo)}`);
		}
	});

	// Load translations and language config when authenticated.
	// We always call load() once per session: cached strings make the UI usable
	// immediately, and load() internally no-ops if the server checksum matches.
	// Without this, users stay pinned to whatever they cached previously and
	// never see new keys added to language YAML files.
	//
	// Gate on `prefs.loaded` so we pass the user's `adminLanguage` into load().
	// Without this gate, load() runs with the builtin default ('en-US') and the
	// admin boots in English regardless of what the user picked in preferences.
	let i18nLoadedThisSession = $state(false);
	$effect(() => {
		if (auth.isAuthenticated && prefs.loaded && !i18nLoadedThisSession) {
			i18nLoadedThisSession = true;
			i18n.load(prefs.adminLanguage);
		}
	});

	// Reflect the active locale and text direction on <html>. Can't do this
	// statically in app.html because SvelteKit serves the same HTML to every
	// user — the language and direction depend on the authenticated user's
	// preference, which we only know after prefs + translations have loaded.
	// Bits-ui (DatePicker, dropdowns, menus) reads `dir` from the document, so
	// updating this is also what flips its internal layouts for RTL.
	$effect(() => {
		if (typeof document === 'undefined') return;
		document.documentElement.setAttribute('lang', i18n.lang);
		document.documentElement.setAttribute('dir', i18n.dir);
	});

	$effect(() => {
		if (auth.isAuthenticated && !contentLang.loaded) {
			contentLang.load();
		}
	});

	// Preferences lifecycle. Three things in one effect:
	//   1. Initial fetch (seed stores + run one-time legacy migration)
	//   2. Periodic poll every 30s while the tab is visible — picks up
	//      changes made on another browser/device without a hard refresh.
	//   3. Immediate refetch on tab focus.
	// The poll doubles as a session keep-alive: every fetch runs through
	// `ensureFreshToken`, so an idle SPA still refreshes its JWT.
	// `hasPendingSync()` guards against clobbering the user's in-flight
	// edits (e.g. mid-slider-drag) with a stale server snapshot.
	$effect(() => {
		if (!auth.isAuthenticated) return;

		let migrated = false;
		let lastFetchAt = 0;

		async function refresh() {
			if (hasPendingSync()) return;
			const now = Date.now();
			if (now - lastFetchAt < 5_000) return;
			lastFetchAt = now;
			try {
				const payload = await getPreferences();
				// While the user is actively editing (page content or any config
				// form), do NOT re-seed the preference/theme/branding stores. A
				// background poll must never disturb the editing surface: re-init
				// here can churn a store the page editor depends on (e.g.
				// `collabEnabled`), which tears down and reseeds the collaboration
				// session and silently loses unsaved work (admin2#83). The fetch
				// itself still ran, so the JWT stays fresh; we just defer applying
				// the result until the edit is saved or abandoned.
				if (hasUnsavedChanges()) return;
				prefs.init(payload);
				theme.init(payload);
				branding.init(payload);
				if (!migrated) {
					migrated = true;
					const migratedPayload = await migrateLegacyPreferences(payload);
					if (migratedPayload) {
						prefs.init(migratedPayload);
						theme.init(migratedPayload);
						branding.init(migratedPayload);
					}
				}
			} catch (err) {
				console.error('[preferences] fetch failed:', err);
			}
		}

		void refresh();

		const pollTimer = setInterval(() => {
			if (document.visibilityState === 'visible') void refresh();
		}, 30_000);

		const onVisibilityChange = () => {
			if (document.visibilityState === 'visible') void refresh();
		};
		document.addEventListener('visibilitychange', onVisibilityChange);

		return () => {
			clearInterval(pollTimer);
			document.removeEventListener('visibilitychange', onVisibilityChange);
		};
	});

	// Pre-register custom field types from all enabled plugins at startup
	let customFieldsLoaded = false;
	$effect(() => {
		if (auth.isAuthenticated && !customFieldsLoaded) {
			customFieldsLoaded = true;
			import('$lib/api/client').then(({ api }) =>
				// Each value is either a bare slug (legacy API → assume a plugin) or
				// `{ slug, kind }` so theme-provided fields resolve to the right route.
				api.get<Record<string, string | { slug: string; kind: 'plugins' | 'themes' }>>('/custom-fields')
					.then((data) => {
						if (data && typeof data === 'object') {
							for (const [fieldType, provider] of Object.entries(data)) {
								const slug = typeof provider === 'string' ? provider : provider.slug;
								const kind = typeof provider === 'string' ? 'plugins' : provider.kind;
								customFieldRegistry.register(slug, { [fieldType]: fieldType }, kind);
							}
						}
					})
					.catch(() => { /* Custom fields endpoint not available */ })
			);
		}
	});

	// Expose the confirm dialog API to plugin web components via window.__GRAV_DIALOGS
	// so they can use the admin-next ConfirmModal instead of native browser confirm().
	$effect(() => {
		if (typeof window === 'undefined') return;
		window.__GRAV_DIALOGS = {
			confirm: (options) => dialogs.confirm(options),
			// Richer modals: `form` builds a lightweight modal from inline field
			// definitions (resolves the entered values, or null on cancel);
			// `open` mounts a plugin's own modal web component
			// (grav-{plugin}--modal-{component}) and resolves whatever it reports.
			form: (options) => modals.form(options),
			open: (options) => modals.open({ ...options, kind: 'component' }),
		};
	});

	// Expose the svelte-sonner toast API to plugin web components so they can post
	// success/error/info notifications through the admin's own toaster instead of
	// rolling their own. All four levels mirror sonner's signature (text + options).
	$effect(() => {
		if (typeof window === 'undefined') return;
		window.__GRAV_TOAST = {
			success: (msg, opts) => toast.success(msg, opts),
			error:   (msg, opts) => toast.error(msg, opts),
			info:    (msg, opts) => toast.info(msg, opts),
			warning: (msg, opts) => toast.warning(msg, opts),
		};
	});

	// Expose the admin route base + SPA navigation so plugin web components
	// can build correct URLs (admin may be mounted at any route, e.g. /admin
	// or /grav-api/admin) and navigate without triggering a full page load.
	$effect(() => {
		if (typeof window === 'undefined') return;
		window.__GRAV_ADMIN_BASE = base;
		window.__GRAV_NAVIGATE = (url, opts) => goto(url, opts);
	});

	// SvelteKit's version-poll (configured in svelte.config.js) flips
	// `updated.current` to true when _app/version.json changes — i.e. admin2
	// (or anything else writing to the SPA's bundle) has been updated under
	// us. The next intra-app navigation must be a full page load instead of
	// an SPA fetch; otherwise the router asks for a chunk hash that no
	// longer exists on disk and the user sees a 500.
	beforeNavigate((nav) => {
		// Don't force a full page load out from under an active edit: a hard
		// reload here would discard unsaved page content or config changes
		// (admin2#83). The unsaved-guard already prompts on the navigation
		// itself; once the user saves or discards, the next clean navigation
		// picks up the new bundle.
		if (updated.current && !nav.willUnload && nav.to?.url && !hasUnsavedChanges()) {
			nav.cancel();
			window.location.href = nav.to.url.href;
		}
	});

	// Focus-based invalidation safety net: if the tab was blurred for >30s,
	// emit `*:focus` so list views can pull in any changes made elsewhere.
	// Only emits on actual focus events, not initial page load.
	$effect(() => {
		if (typeof window === 'undefined') return;
		let lastFocus = Date.now();
		let everBlurred = false;
		function onFocus() {
			if (everBlurred && Date.now() - lastFocus > 30_000) {
				invalidations.emit({ tag: '*:focus', resource: '*', action: 'focus' });
			}
			lastFocus = Date.now();
		}
		function onBlur() {
			everBlurred = true;
			lastFocus = Date.now();
		}
		window.addEventListener('focus', onFocus);
		window.addEventListener('blur', onBlur);
		return () => {
			window.removeEventListener('focus', onFocus);
			window.removeEventListener('blur', onBlur);
		};
	});
</script>

<svelte:head><link rel="icon" href={faviconHref} /></svelte:head>

<Toaster
	position={i18n.dir === 'rtl' ? 'bottom-left' : 'bottom-right'}
	closeButton
	visibleToasts={5}
	toastOptions={{
		class: 'grav-toast',
	}}
/>

<GlobalDialogs />
<PluginModal />

{#if isAuthPage}
	{@render children()}
{:else if auth.isAuthenticated}
	<AppShell>
		{@render children()}
	</AppShell>
{:else if bootResolving}
	<div class="flex h-screen w-full items-center justify-center">
		<Loader2 size={28} class="animate-spin text-muted-foreground" />
	</div>
{/if}
