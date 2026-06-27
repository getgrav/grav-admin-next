<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { mediaManager, type SortField } from '$lib/stores/mediaManager.svelte';
	import { toast } from 'svelte-sonner';
	import MediaFileRow from './MediaFileRow.svelte';
	import { ArrowUp, ArrowDown } from 'lucide-svelte';

	const { folders, files, sortField, sortOrder, reordering } = $derived(mediaManager);

	function toggleSort(field: SortField) {
		mediaManager.setSort(field);
	}

	// Transient drag-to-reorder state.
	let draggingIndex = $state<number | null>(null);
	let dragOverIndex = $state<number | null>(null);
	let dropPos = $state<'before' | 'after'>('before');

	// The whole row is the drag source (there's no drag-into-editor here to
	// compete with), with the row itself as the ghost — so you drag the row,
	// not a tiny grip.
	function handleDragStart(e: DragEvent, index: number) {
		if (!reordering || !e.dataTransfer) return;
		// Stop the drag from reaching MediaManager's file-upload dropzone.
		e.stopPropagation();
		draggingIndex = index;
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('application/x-grav-media-reorder', String(index));
		const row = e.currentTarget as HTMLElement | null;
		if (row) e.dataTransfer.setDragImage(row, 24, row.clientHeight / 2);
	}

	function handleDragOver(e: DragEvent, index: number) {
		if (draggingIndex === null) return;
		// stopPropagation keeps the outer upload dropzone from overwriting
		// dropEffect with 'copy' (which would reject our 'move' drop).
		e.preventDefault();
		e.stopPropagation();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		dropPos = e.clientY - rect.top > rect.height / 2 ? 'after' : 'before';
		dragOverIndex = index;
	}

	async function handleDrop(e: DragEvent, index: number) {
		if (draggingIndex === null) return;
		e.preventDefault();
		e.stopPropagation();
		await commitReorder(index, dropPos);
	}

	// Container-level: catches releases in the row gaps/borders (where the
	// insertion line sits) so they land instead of snapping back.
	function handleContainerDragOver(e: DragEvent) {
		if (draggingIndex === null) return;
		e.preventDefault();
		e.stopPropagation();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
	}

	async function handleContainerDrop(e: DragEvent) {
		if (draggingIndex === null || dragOverIndex === null) return;
		e.preventDefault();
		e.stopPropagation();
		await commitReorder(dragOverIndex, dropPos);
	}

	async function commitReorder(overIndex: number, pos: 'before' | 'after') {
		const from = draggingIndex!;
		handleDragEnd();
		let to = pos === 'after' ? overIndex + 1 : overIndex;
		if (from < to) to -= 1;
		if (from === to) return;
		try {
			await mediaManager.reorder(from, to);
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.MEDIA.MEDIA_MANAGER.ORDER_SAVE_FAILED'));
		}
	}

	function handleDragEnd() {
		draggingIndex = null;
		dragOverIndex = null;
	}
</script>

<!-- Sort headers -->
<div class="flex items-center gap-3 border-b border-border px-4 py-1.5">
	<!-- Checkbox + thumbnail spacer -->
	<div class="w-[76px] shrink-0"></div>

	<!-- Name -->
	<div class="flex-1">
		<button
			class="flex items-center gap-1 text-[0.6875rem] font-medium uppercase tracking-wider transition-colors
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
	<div class="hidden w-20 text-end sm:block">
		<button
			class="ms-auto flex items-center gap-1 text-[0.6875rem] font-medium uppercase tracking-wider transition-colors
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
	<div class="w-16 text-end">
		<button
			class="ms-auto flex items-center gap-1 text-[0.6875rem] font-medium uppercase tracking-wider transition-colors
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
	<div class="hidden w-24 text-end md:block">
		<button
			class="ms-auto flex items-center gap-1 text-[0.6875rem] font-medium uppercase tracking-wider transition-colors
				{sortField === 'modified' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}"
			onclick={() => toggleSort('modified')}
		>
			{i18n.t('ADMIN_NEXT.PAGES.HEADER_MODIFIED')}
			{#if sortField === 'modified'}
				{#if sortOrder === 'asc'}<ArrowUp size={11} />{:else}<ArrowDown size={11} />{/if}
			{/if}
		</button>
	</div>
</div>

<!-- Rows -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	ondragover={reordering ? handleContainerDragOver : undefined}
	ondrop={reordering ? handleContainerDrop : undefined}
>
	{#each folders as folder (folder.path)}
		<MediaFileRow kind="folder" {folder} />
	{/each}
	{#each files as item, index (item.path + '/' + item.filename)}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="group relative {reordering ? 'cursor-move ring-1 ring-primary/40 active:cursor-grabbing' : ''} {draggingIndex === index ? 'opacity-40' : ''}"
			draggable={reordering}
			ondragstart={reordering ? (e) => handleDragStart(e, index) : undefined}
			ondragend={reordering ? handleDragEnd : undefined}
			ondragenter={reordering ? (e) => handleDragOver(e, index) : undefined}
			ondragover={reordering ? (e) => handleDragOver(e, index) : undefined}
			ondrop={reordering ? (e) => handleDrop(e, index) : undefined}
			title={reordering ? i18n.t('ADMIN_NEXT.MEDIA.MEDIA_MANAGER.REORDER') : undefined}
		>
			<!-- Insertion line: shows which gap the dropped row will land in -->
			{#if dragOverIndex === index && draggingIndex !== index}
				<div
					class="pointer-events-none absolute inset-x-0 z-20 h-0.5 bg-primary {dropPos === 'before' ? 'top-0' : 'bottom-0'}"
				></div>
			{/if}

			<MediaFileRow kind="file" {item} {index} />
		</div>
	{/each}
</div>
