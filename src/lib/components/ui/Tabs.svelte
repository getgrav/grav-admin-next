<script lang="ts">
	import ExtensionIcon from '$lib/components/ui/ExtensionIcon.svelte';
	import type { IconSpec } from '$lib/utils/icon-spec';

	interface TabItem {
		id: string;
		label: string;
		icon?: IconSpec;
	}

	interface Props {
		items: TabItem[];
		active: string;
		onchange: (id: string) => void;
	}

	let { items, active, onchange }: Props = $props();
</script>

<div class="flex border-b border-border">
	{#each items as item (item.id)}
		<button
			class="relative inline-flex items-center px-4 py-2.5 text-sm font-medium transition-colors
				{active === item.id
					? 'text-primary'
					: 'text-muted-foreground hover:text-foreground'}"
			onclick={() => onchange(item.id)}
		>
			{#if item.icon}
				<ExtensionIcon icon={item.icon} class="me-1.5 h-4 w-4 shrink-0 text-sm" />
			{/if}
			{item.label}
			{#if active === item.id}
				<span class="absolute inset-x-0 -bottom-px h-0.5 bg-primary"></span>
			{/if}
		</button>
	{/each}
</div>
