<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { mediaManager, type SortField } from '$lib/stores/mediaManager.svelte';
	import { toast } from 'svelte-sonner';
	import MediaFileRow from './MediaFileRow.svelte';
	import { ArrowUp, ArrowDown, GripVertical } from 'lucide-svelte';

	const { folders, files, sortField, sortOrder, canReorder } = $derived(mediaManager);

	function toggleSort(field: SortField) {
		mediaManager.setSort(field);
	}

	// Transient drag-to-reorder state.
	let draggingIndex = $state<number | null>(null);
	let dragOverIndex = $state<number | null>(null);
	let dropPos = $state<'before' | 'after'>('before');

	// Drag originates from the grip handle (matches the grid + page-media UX).
	function handleDragStart(e: DragEvent, index: number) {
		if (!canReorder || !e.dataTransfer) return;
		// Stop the drag from reaching MediaManager's file-upload dropzone.
		e.stopPropagation();
		draggingIndex = index;
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('application/x-grav-media-reorder', String(index));
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
	ondragover={canReorder ? handleContainerDragOver : undefined}
	ondrop={canReorder ? handleContainerDrop : undefined}
>
	{#each folders as folder (folder.path)}
		<MediaFileRow kind="folder" {folder} />
	{/each}
	{#each files as item, index (item.path + '/' + item.filename)}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="group relative {canReorder ? 'ps-5' : ''} {draggingIndex === index ? 'opacity-40' : ''}"
			ondragenter={canReorder ? (e) => handleDragOver(e, index) : undefined}
			ondragover={canReorder ? (e) => handleDragOver(e, index) : undefined}
			ondrop={canReorder ? (e) => handleDrop(e, index) : undefined}
		>
			<!-- Insertion line: shows which gap the dropped row will land in -->
			{#if dragOverIndex === index && draggingIndex !== index}
				<div
					class="pointer-events-none absolute inset-x-0 z-20 h-0.5 bg-primary {dropPos === 'before' ? 'top-0' : 'bottom-0'}"
				></div>
			{/if}

			<!-- Drag handle (grip) on the left — the reorder drag source -->
			{#if canReorder}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="absolute start-0 top-1/2 z-20 flex h-7 w-5 -translate-y-1/2 cursor-grab items-center justify-center rounded text-muted-foreground/70 transition-colors hover:text-foreground active:cursor-grabbing"
					title={i18n.t('ADMIN_NEXT.MEDIA.MEDIA_MANAGER.REORDER')}
					draggable="true"
					ondragstart={(e) => handleDragStart(e, index)}
					ondragend={handleDragEnd}
				>
					<GripVertical size={15} />
				</div>
			{/if}

			<MediaFileRow kind="file" {item} {index} />
		</div>
	{/each}
</div>
