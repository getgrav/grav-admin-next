<script lang="ts">
	import { getContext } from 'svelte';
	import PageMedia from '$lib/components/media/PageMedia.svelte';
	import type { PageMediaContext } from '$lib/components/media/types';

	const getRoute = getContext<(() => string) | undefined>('pageRoute');
	const mediaCtx = getContext<PageMediaContext | undefined>('pageMediaItems');
	const route = $derived(getRoute?.() ?? '/');
</script>

{#if route}
	<PageMedia {route} onMediaChange={(items) => mediaCtx?.update(items)} externalItems={mediaCtx?.items} />
{:else}
	<div class="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
		Page media unavailable
	</div>
{/if}
