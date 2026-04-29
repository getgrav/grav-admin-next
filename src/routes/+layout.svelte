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
	import { generateFavicon } from '$lib/utils/favicon';
	import AppShell from '$lib/components/AppShell.svelte';
	import GlobalDialogs from '$lib/components/ui/GlobalDialogs.svelte';
	import { dialogs } from '$lib/stores/dialogs.svelte';
	import { Toaster } from 'svelte-sonner';

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
	let i18nLoadedThisSession = $state(false);
	$effect(() => {
		if (auth.isAuthenticated && !i18nLoadedThisSession) {
			i18nLoadedThisSession = true;
			i18n.load();
		}
	});

	$effect(() => {
		if (auth.isAuthenticated && !contentLang.loaded) {
			contentLang.load();
		}
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
	position="bottom-right"
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
