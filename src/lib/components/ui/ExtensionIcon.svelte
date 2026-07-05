<script lang="ts">
	import * as icons from 'lucide-svelte';
	import { resolveIconSpec, resolveLucideName, type IconSpec } from '$lib/utils/icon-spec';

	interface Props {
		icon?: IconSpec | null;
		class?: string;
		size?: number;
	}

	let { icon, class: className = 'me-1.5 text-sm', size = 16 }: Props = $props();

	const resolved = $derived(resolveIconSpec(icon));
	const lucideIcon = $derived(
		resolved?.type === 'lucide'
			? (icons as Record<string, any>)[resolveLucideName(resolved.name)]
			: null,
	);
</script>

{#if resolved?.type === 'class'}
	<i aria-hidden="true" class="{resolved.className} {className}"></i>
{:else if resolved?.type === 'lucide' && lucideIcon}
	{@const Icon = lucideIcon}
	<Icon {size} class={className} aria-hidden="true" />
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
