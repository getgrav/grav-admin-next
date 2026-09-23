<script lang="ts">
	/**
	 * A Lucide icon picked by name at runtime (a plugin's context panel or
	 * dashboard notification). The icon loads lazily; `fallback` renders when the
	 * name turns out not to be a Lucide icon, e.g. an emoji.
	 */
	import type { Component, Snippet } from 'svelte';
	import { loadLucideIcon, peekLucideIcon } from '$lib/utils/lucide-icon';

	interface Props {
		name: string | null | undefined;
		size?: number;
		class?: string;
		fallback?: Snippet;
	}

	let { name, size = 16, class: className = '', fallback }: Props = $props();

	// null = still loading, undefined = not a Lucide icon.
	let icon = $state.raw<Component | undefined | null>(null);

	$effect(() => {
		const current = name;
		const known = peekLucideIcon(current);
		icon = known;
		if (known !== null) return;
		let cancelled = false;
		void loadLucideIcon(current).then((resolved) => {
			if (!cancelled) icon = resolved;
		});
		return () => {
			cancelled = true;
		};
	});
</script>

{#if icon}
	{@const Icon = icon}
	<Icon {size} class={className} />
{:else if icon === undefined}
	{@render fallback?.()}
{/if}
