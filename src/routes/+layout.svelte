<script lang="ts">
	import './layout.css';
	import '@fortawesome/fontawesome-free/css/all.min.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { auth } from '$lib/stores/auth.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import AppShell from '$lib/components/AppShell.svelte';
	import { Toaster } from 'svelte-sonner';

	let { children } = $props();

	const isLoginPage = $derived(page.url.pathname === `${base}/login`);
	const needsAuth = $derived(!isLoginPage && !auth.isAuthenticated);

	$effect(() => {
		if (needsAuth) {
			goto(`${base}/login`);
		}
	});

	// Load translations when authenticated
	$effect(() => {
		if (auth.isAuthenticated && !i18n.loaded) {
			i18n.load();
		}
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

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
