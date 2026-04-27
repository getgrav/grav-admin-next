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

	@keyframes top-progress-slide {
		0% {
			transform: translateX(-100%);
			width: 30%;
		}
		50% {
			width: 60%;
		}
		100% {
			transform: translateX(250%);
			width: 30%;
		}
	}
</style>
