<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	let { active = false }: { active?: boolean } = $props();
</script>

{#if active}
	<div
		class="pointer-events-none fixed inset-x-0 top-0 z-50 h-[2px] overflow-hidden"
		role="progressbar"
		aria-busy="true"
		aria-label={i18n.t('ADMIN_NEXT.TOP_PROGRESS_BAR.WORKING')}
	>
		<div class="top-progress-bar h-full bg-primary"></div>
	</div>
{/if}

<style>
	.top-progress-bar {
		width: 40%;
		animation: top-progress-slide 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
	}

	/* Bar width stays constant so translateX (which is relative to the
	   bar's own width) maps to a stable horizontal position. The earlier
	   width-pulse variant produced apparent backwards motion in the last
	   quarter of the cycle, when the shrinking width made the same
	   translateX percentage resolve to a smaller pixel offset. */
	@keyframes top-progress-slide {
		from {
			transform: translateX(-100%);
		}
		to {
			transform: translateX(250%);
		}
	}
</style>
