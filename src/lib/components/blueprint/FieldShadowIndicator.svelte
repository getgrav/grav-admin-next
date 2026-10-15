<script lang="ts">
	import { getContext } from 'svelte';
	import ShadowMarker from '$lib/components/config/ShadowMarker.svelte';
	import { CONFIG_SHADOWED_CTX, type ConfigShadowedCtx } from '$lib/utils/config-shadowed.svelte';

	/**
	 * Marks a field whose value a layer above the one being edited sets (the
	 * booted environment's file, or a GRAV_CONFIG server variable), so what is
	 * saved here won't apply. Renders nothing outside a config form that
	 * provides the `configShadowed` context (provideConfigShadowed).
	 */
	let { path }: { path: string } = $props();

	const ctx = getContext<ConfigShadowedCtx | undefined>(CONFIG_SHADOWED_CTX);
	const hit = $derived(ctx ? ctx.forField(path) : null);
</script>

{#if ctx && hit}
	<ShadowMarker
		source={hit.entry}
		hasValue={hit.exact}
		value={hit.entry.value}
		canRemove={ctx.canRemove && hit.entry.source === 'environment'}
		busy={ctx.busy}
		onremove={() => ctx.remove([hit.entry])}
	/>
{/if}
