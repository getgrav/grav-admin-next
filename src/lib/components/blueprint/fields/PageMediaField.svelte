<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { getContext } from 'svelte';
	import PageMedia from '$lib/components/media/PageMedia.svelte';
	import type { PageMediaContext, MediaSource } from '$lib/components/media/types';
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';

	interface Props {
		field?: BlueprintField;
	}

	let { field }: Props = $props();
	// The blueprint's `label` heads the box when it has one (a module's
	// "Pictures"); without one it stays "Page Media".
	const title = $derived(field?.label ? i18n.tMaybe(field.label) : undefined);

	const getRoute = getContext<(() => string) | undefined>('pageRoute');
	const getMediaSource = getContext<(() => MediaSource) | undefined>('mediaSource');
	const mediaCtx = getContext<PageMediaContext | undefined>('pageMediaItems');
	const route = $derived(getRoute?.() ?? '/');
	const source = $derived(getMediaSource?.());
</script>

{#if source}
	<PageMedia
		{title}
		apiBase={source.apiBase}
		invalidationKeys={source.invalidationKeys}
		onMediaChange={(items) => mediaCtx?.update(items)}
		externalItems={mediaCtx?.items}
	/>
{:else if route}
	<PageMedia
		{route}
		{title}
		onMediaChange={(items) => mediaCtx?.update(items)}
		externalItems={mediaCtx?.items}
		onOrderChange={mediaCtx?.setOrder ? (filenames) => mediaCtx.setOrder?.(filenames) : undefined}
		orderActive={mediaCtx?.orderActive ?? false}
	/>
{:else}
	<div class="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
		{i18n.t('ADMIN_NEXT.FIELDS.PAGE_MEDIA.PAGE_MEDIA_UNAVAILABLE')}
	</div>
{/if}
