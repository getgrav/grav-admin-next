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
	import { generateFavicon } from '$lib/utils/favicon';
	import AppShell from '$lib/components/AppShell.svelte';
	import { Toaster } from 'svelte-sonner';

	let { children } = $props();

	const isLoginPage = $derived(page.url.pathname === `${base}/login`);
	const needsAuth = $derived(!isLoginPage && !auth.isAuthenticated);

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
			const url = `${auth.serverUrl}${auth.apiPrefix || '/api/v1'}/custom-fields`;
			const headers: Record<string, string> = {};
			if (auth.accessToken) headers['Authorization'] = `Bearer ${auth.accessToken}`;
			fetch(url, { headers })
				.then(r => r.json())
				.then((json) => {
					const data = json.data ?? json;
					if (data && typeof data === 'object') {
						for (const [fieldType, pluginSlug] of Object.entries(data)) {
							customFieldRegistry.register(pluginSlug as string, { [fieldType]: fieldType });
						}
					}
				})
				.catch(() => { /* Custom fields endpoint not available */ });
		}
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

{#if isLoginPage}
	{@render children()}
{:else if auth.isAuthenticated}
	<AppShell>
		{@render children()}
	</AppShell>
{/if}
