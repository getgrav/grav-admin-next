<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { retinaLabel } from '$lib/utils/retina';

	/**
	 * Marks an image that has `@2x`/`@3x` files beside it. The media listings
	 * show such a set as the one base image (admin2#222), so this badge is
	 * how the user can tell the retina files are there.
	 */
	let { scales, overlay = false }: { scales?: number[]; overlay?: boolean } = $props();

	const label = $derived(retinaLabel(scales));
</script>

{#if label}
	<span
		class="inline-flex shrink-0 items-center rounded px-1 font-mono text-[0.625rem] font-medium leading-4
			{overlay ? 'bg-black/60 text-white shadow-sm backdrop-blur-sm' : 'bg-muted text-muted-foreground'}"
		title={i18n.t('ADMIN_NEXT.MEDIA.FILE_DETAILS.RETINA_HINT', { scales: retinaLabel(scales, true) })}
	>
		{label}
	</span>
{/if}
