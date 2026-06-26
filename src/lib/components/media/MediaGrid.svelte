<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { mediaManager } from '$lib/stores/mediaManager.svelte';
	import { toast } from 'svelte-sonner';
	import { GripVertical } from 'lucide-svelte';
	import MediaFileCard from './MediaFileCard.svelte';

	const { folders, files, canReorder } = $derived(mediaManager);

	// Transient drag-to-reorder state.
	let draggingIndex = $state<number | null>(null);
	let dragOverIndex = $state<number | null>(null);
	let dropPos = $state<'before' | 'after'>('before');

	// Drag originates from the grip handle (a clean element), not the whole
	// card — a card-wide drag wraps the thumbnail + click-to-select and its
	// drop gets rejected by the browser. The grip mirrors the page-media UX.
	function handleDragStart(e: DragEvent, index: number) {
		if (!canReorder || !e.dataTransfer) return;
		// Stop the drag from reaching MediaManager's file-upload dropzone.
		e.stopPropagation();
		draggingIndex = index;
		e.dataTransfer.effectAllowed = 'move';
		// A payload is required for Firefox to start the drag at all.
		e.dataTransfer.setData('application/x-grav-media-reorder', String(index));
	}

	function handleDragOver(e: DragEvent, index: number) {
		if (draggingIndex === null) return;
		// dragenter + dragover must preventDefault for drop to fire. stopPropagation
		// keeps the outer upload dropzone from overwriting dropEffect with 'copy'
		// (which, against our 'move' effectAllowed, would reject the drop).
		e.preventDefault();
		e.stopPropagation();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		dropPos = e.clientX - rect.left > rect.width / 2 ? 'after' : 'before';
		dragOverIndex = index;
	}

	async function handleDrop(e: DragEvent, index: number) {
		if (draggingIndex === null) return;
		e.preventDefault();
		e.stopPropagation();
		await commitReorder(index, dropPos);
	}

	// Container-level: keeps the drop alive over the gaps between cards (where
	// the insertion line sits) so releasing there lands instead of snapping
	// back. Drops over a card are handled by the item drop (which stops
	// propagation), so this only fires for gap/padding releases.
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

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3 p-4"
	ondragover={canReorder ? handleContainerDragOver : undefined}
	ondrop={canReorder ? handleContainerDrop : undefined}
>
	{#each folders as folder (folder.path)}
		<MediaFileCard kind="folder" {folder} />
	{/each}
	{#each files as item, index (item.path + '/' + item.filename)}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="group relative rounded-lg transition-opacity {draggingIndex === index ? 'opacity-40' : ''}"
			ondragenter={canReorder ? (e) => handleDragOver(e, index) : undefined}
			ondragover={canReorder ? (e) => handleDragOver(e, index) : undefined}
			ondrop={canReorder ? (e) => handleDrop(e, index) : undefined}
		>
			<!-- Insertion line: shows which side the dropped item will land on -->
			{#if dragOverIndex === index && draggingIndex !== index}
				<div
					class="pointer-events-none absolute inset-y-1 z-20 w-1 rounded-full bg-primary {dropPos === 'before' ? '-left-2' : '-right-2'}"
				></div>
			{/if}

			<!-- Drag handle (grip) — the reorder drag source -->
			{#if canReorder}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="absolute right-1.5 top-1.5 z-10 cursor-grab rounded bg-background/80 p-0.5 opacity-0 shadow-sm transition-opacity hover:bg-background group-hover:opacity-100 active:cursor-grabbing"
					title={i18n.t('ADMIN_NEXT.MEDIA.MEDIA_MANAGER.REORDER')}
					draggable="true"
					ondragstart={(e) => handleDragStart(e, index)}
					ondragend={handleDragEnd}
				>
					<GripVertical size={14} class="text-foreground/70" />
				</div>
			{/if}

			<MediaFileCard kind="file" {item} {index} />
		</div>
	{/each}
</div>
