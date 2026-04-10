<script lang="ts">
	import './layout.css';
	import '@fortawesome/fontawesome-free/css/all.min.css';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { auth } from '$lib/stores/auth.svelte';
	import { theme } from '$lib/stores/theme.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { contentLang } from '$lib/stores/contentLang.svelte';
	import { customFieldRegistry } from '$lib/stores/customFields.svelte';
	import { invalidations } from '$lib/stores/invalidation.svelte';
	import { generateFavicon } from '$lib/utils/favicon';
	import AppShell from '$lib/components/AppShell.svelte';
	import { Toaster } from 'svelte-sonner';

	let { children } = $props();

	const isAuthPage = $derived(
		page.url.pathname === `${base}/login` ||
		page.url.pathname === `${base}/forgot` ||
		page.url.pathname === `${base}/reset`
	);
	const needsAuth = $derived(!isAuthPage && !auth.isAuthenticated);

	$effect(() => {
		if (needsAuth) {
			const returnTo = page.url.pathname + page.url.search + page.url.hash;
			goto(`${base}/login?returnTo=${encodeURIComponent(returnTo)}`);
		}
	});

	// Load translations and language config when authenticated
	$effect(() => {
		if (auth.isAuthenticated && !i18n.loaded) {
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

{#if isAuthPage}
	{@render children()}
{:else if auth.isAuthenticated}
	<AppShell>
		{@render children()}
	</AppShell>
{/if}
