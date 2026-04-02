<script lang="ts">
	interface TabItem {
		id: string;
		label: string;
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
			class="relative px-4 py-2.5 text-sm font-medium transition-colors
				{active === item.id
					? 'text-primary'
					: 'text-muted-foreground hover:text-foreground'}"
			onclick={() => onchange(item.id)}
		>
			{item.label}
			{#if active === item.id}
				<span class="absolute inset-x-0 -bottom-px h-0.5 bg-primary"></span>
			{/if}
		</button>
	{/each}
</div>
