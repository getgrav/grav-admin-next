<script lang="ts">
	import { getContext } from 'svelte';
	import PageMedia from '$lib/components/media/PageMedia.svelte';

	const getRoute = getContext<(() => string) | undefined>('pageRoute');
	const route = $derived(getRoute?.() ?? '/');
</script>

{#if route}
	<PageMedia {route} />
{:else}
	<div class="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
		Page media unavailable
	</div>
{/if}
