<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/stores/auth.svelte';
	import AppShell from '$lib/components/AppShell.svelte';

	let { children } = $props();

	const isLoginPage = $derived(page.url.pathname === '/login');
	const needsAuth = $derived(!isLoginPage && !auth.isAuthenticated);

	$effect(() => {
		if (needsAuth) {
			goto('/login');
		}
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

{#if isLoginPage}
	{@render children()}
{:else if auth.isAuthenticated}
	<AppShell>
		{@render children()}
	</AppShell>
{/if}
