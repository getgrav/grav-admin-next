<script lang="ts">
	import './layout.css';
	import '@fortawesome/fontawesome-free/css/all.min.css';
	import { page, updated } from '$app/state';
	import { goto, beforeNavigate } from '$app/navigation';
	import { base } from '$app/paths';
	import { auth } from '$lib/stores/auth.svelte';
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
	import { generateFavicon } from '$lib/utils/favicon';
	import AppShell from '$lib/components/AppShell.svelte';
	import GlobalDialogs from '$lib/components/ui/GlobalDialogs.svelte';
	import { dialogs } from '$lib/stores/dialogs.svelte';
	import { Toaster, toast } from 'svelte-sonner';

	let { children } = $props();

	const isAuthPage = $derived(
		page.url.pathname === `${base}/login` ||
		page.url.pathname === `${base}/forgot` ||
		page.url.pathname === `${base}/reset` ||
		page.url.pathname === `${base}/setup`
	);
	const needsAuth = $derived(!isAuthPage && !auth.isAuthenticated);

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
	// Without this gate, load() runs with the builtin default ('en') and the
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
				api.get<Record<string, string>>('/custom-fields')
					.then((data) => {
						if (data && typeof data === 'object') {
							for (const [fieldType, pluginSlug] of Object.entries(data)) {
								customFieldRegistry.register(pluginSlug as string, { [fieldType]: fieldType });
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
		if (updated.current && !nav.willUnload && nav.to?.url) {
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

<svelte:head><link rel="icon" href={generateFavicon(theme.accentHue, theme.accentSaturation, theme.isDark)} /></svelte:head>

<Toaster
	position={i18n.dir === 'rtl' ? 'bottom-left' : 'bottom-right'}
	closeButton
	visibleToasts={5}
	toastOptions={{
		class: 'grav-toast',
	}}
/>

<GlobalDialogs />

{#if isAuthPage}
	{@render children()}
{:else if auth.isAuthenticated}
	<AppShell>
		{@render children()}
	</AppShell>
{/if}
