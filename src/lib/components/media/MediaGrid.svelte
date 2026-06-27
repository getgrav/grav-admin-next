<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { mediaManager } from '$lib/stores/mediaManager.svelte';
	import { toast } from 'svelte-sonner';
	import MediaFileCard from './MediaFileCard.svelte';

	const { folders, files, reordering } = $derived(mediaManager);

	// Transient drag-to-reorder state.
	let draggingIndex = $state<number | null>(null);
	let dragOverIndex = $state<number | null>(null);
	let dropPos = $state<'before' | 'after'>('before');

	// In reorder mode the whole card is the drag source, with the card as the
	// drag ghost — you drag the image itself, no grip handle (matches the page-
	// media panel). The card's own <img> is draggable=false, so the card-wide
	// drag is clean.
	function handleDragStart(e: DragEvent, index: number) {
		if (!reordering || !e.dataTransfer) return;
		// Stop the drag from reaching MediaManager's file-upload dropzone.
		e.stopPropagation();
		draggingIndex = index;
		e.dataTransfer.effectAllowed = 'move';
		// A payload is required for Firefox to start the drag at all.
		e.dataTransfer.setData('application/x-grav-media-reorder', String(index));
		const card = e.currentTarget as HTMLElement | null;
		if (card) e.dataTransfer.setDragImage(card, card.clientWidth / 2, card.clientHeight / 2);
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
	ondragover={reordering ? handleContainerDragOver : undefined}
	ondrop={reordering ? handleContainerDrop : undefined}
>
	{#each folders as folder (folder.path)}
		<MediaFileCard kind="folder" {folder} />
	{/each}
	{#each files as item, index (item.path + '/' + item.filename)}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="group relative rounded-lg transition-opacity {reordering ? 'cursor-move ring-1 ring-primary/40 active:cursor-grabbing' : ''} {draggingIndex === index ? 'opacity-40' : ''}"
			draggable={reordering}
			ondragstart={reordering ? (e) => handleDragStart(e, index) : undefined}
			ondragend={reordering ? handleDragEnd : undefined}
			ondragenter={reordering ? (e) => handleDragOver(e, index) : undefined}
			ondragover={reordering ? (e) => handleDragOver(e, index) : undefined}
			ondrop={reordering ? (e) => handleDrop(e, index) : undefined}
			title={reordering ? i18n.t('ADMIN_NEXT.MEDIA.MEDIA_MANAGER.REORDER') : undefined}
		>
			<!-- Insertion line: shows which side the dropped item will land on -->
			{#if dragOverIndex === index && draggingIndex !== index}
				<div
					class="pointer-events-none absolute inset-y-1 z-20 w-1 rounded-full bg-primary {dropPos === 'before' ? '-left-2' : '-right-2'}"
				></div>
			{/if}

			<MediaFileCard kind="file" {item} {index} />
		</div>
	{/each}
</div>
