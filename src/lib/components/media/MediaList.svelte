<script lang="ts">
	import { mediaManager, type SortField } from '$lib/stores/mediaManager.svelte';
	import MediaFileRow from './MediaFileRow.svelte';
	import { ArrowUp, ArrowDown } from 'lucide-svelte';

	const { folders, files, sortField, sortOrder } = $derived(mediaManager);

	function toggleSort(field: SortField) {
		mediaManager.setSort(field);
	}
</script>

<!-- Sort headers -->
<div class="flex items-center gap-3 border-b border-border px-4 py-1.5">
	<!-- Checkbox + thumbnail spacer -->
	<div class="w-[76px] shrink-0"></div>

	<!-- Name -->
	<div class="flex-1">
		<button
			class="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider transition-colors
				{sortField === 'name' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}"
			onclick={() => toggleSort('name')}
		>
			Name
			{#if sortField === 'name'}
				{#if sortOrder === 'asc'}<ArrowUp size={11} />{:else}<ArrowDown size={11} />{/if}
			{/if}
		</button>
	</div>

	<!-- Type -->
	<div class="hidden w-20 text-right sm:block">
		<button
			class="ml-auto flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider transition-colors
				{sortField === 'type' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}"
			onclick={() => toggleSort('type')}
		>
			Type
			{#if sortField === 'type'}
				{#if sortOrder === 'asc'}<ArrowUp size={11} />{:else}<ArrowDown size={11} />{/if}
			{/if}
		</button>
	</div>

	<!-- Size -->
	<div class="w-16 text-right">
		<button
			class="ml-auto flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider transition-colors
				{sortField === 'size' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}"
			onclick={() => toggleSort('size')}
		>
			Size
			{#if sortField === 'size'}
				{#if sortOrder === 'asc'}<ArrowUp size={11} />{:else}<ArrowDown size={11} />{/if}
			{/if}
		</button>
	</div>

	<!-- Date -->
	<div class="hidden w-24 text-right md:block">
		<button
			class="ml-auto flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider transition-colors
				{sortField === 'modified' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}"
			onclick={() => toggleSort('modified')}
		>
			Modified
			{#if sortField === 'modified'}
				{#if sortOrder === 'asc'}<ArrowUp size={11} />{:else}<ArrowDown size={11} />{/if}
			{/if}
		</button>
	</div>
</div>

<!-- Rows -->
<div>
	{#each folders as folder (folder.path)}
		<MediaFileRow kind="folder" {folder} />
	{/each}
	{#each files as item, index (item.path + '/' + item.filename)}
		<MediaFileRow kind="file" {item} {index} />
	{/each}
</div>
