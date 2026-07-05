<script lang="ts">
	import { resolveIconSpec, type IconSpec } from '$lib/utils/icon-spec';

	interface Props {
		icon?: IconSpec | null;
		class?: string;
	}

	let { icon, class: className = 'me-1.5 text-sm' }: Props = $props();

	const resolved = $derived(resolveIconSpec(icon));
</script>

{#if resolved?.type === 'class'}
	<i aria-hidden="true" class="{resolved.className} {className}"></i>
{:else if resolved?.type === 'svg'}
	<svg
		aria-hidden="true"
		class={className}
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		viewBox={resolved.viewBox}
	>
		{#each resolved.elements as element}
			<svelte:element this={element.tag} {...element.attrs} />
		{/each}
	</svg>
{/if}
