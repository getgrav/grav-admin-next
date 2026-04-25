<script lang="ts">
	import WidgetHost from './WidgetHost.svelte';
	import { GripVertical, EyeOff, Plus } from 'lucide-svelte';
	import type { ResolvedWidget, WidgetSize } from '$lib/dashboard/types';

	let {
		widgets,
		editMode = false,
		onChange,
		onAddClick,
	}: {
		widgets: ResolvedWidget[];
		editMode?: boolean;
		onChange?: (next: ResolvedWidget[]) => void;
		onAddClick?: () => void;
	} = $props();

	function spanClass(size: WidgetSize): string {
		switch (size) {
			case 'xs': return 'col-span-2 md:col-span-1';
			case 'sm': return 'col-span-2 md:col-span-2 lg:col-span-1';
			case 'md': return 'col-span-2 md:col-span-2';
			case 'lg': return 'col-span-2 md:col-span-2 lg:col-span-3';
			case 'xl': return 'col-span-2 md:col-span-2 lg:col-span-4';
		}
	}

	const visibleWidgets = $derived(widgets.filter(w => w.visible));

	let dragId = $state<string | null>(null);
	let dropTargetId = $state<string | null>(null);

	function handleDragStart(e: DragEvent, id: string) {
		if (!editMode) return;
		dragId = id;
		e.dataTransfer?.setData('text/plain', id);
		e.dataTransfer!.effectAllowed = 'move';
	}

	function handleDragOver(e: DragEvent, id: string) {
		if (!editMode || !dragId || dragId === id) return;
		e.preventDefault();
		dropTargetId = id;
	}

	function handleDrop(e: DragEvent, id: string) {
		if (!editMode || !dragId || dragId === id) {
			dragId = null; dropTargetId = null;
			return;
		}
		e.preventDefault();
		const fromIdx = widgets.findIndex(w => w.id === dragId);
		const toIdx = widgets.findIndex(w => w.id === id);
		if (fromIdx === -1 || toIdx === -1) return;
		const next = [...widgets];
		const [moved] = next.splice(fromIdx, 1);
		next.splice(toIdx, 0, moved);
		// Reflow order ascending
		next.forEach((w, i) => { w.order = i + 1; });
		onChange?.(next);
		dragId = null; dropTargetId = null;
	}

	function handleDragEnd() {
		dragId = null;
		dropTargetId = null;
	}

	function changeSize(id: string, size: WidgetSize) {
		const next = widgets.map(w => w.id === id ? { ...w, size } : w);
		onChange?.(next);
	}

	function hideWidget(id: string) {
		const next = widgets.map(w => w.id === id ? { ...w, visible: false } : w);
		onChange?.(next);
	}
</script>

<div class="grid grid-cols-2 gap-5 lg:grid-cols-4 auto-rows-min">
	{#each visibleWidgets as widget (widget.id)}
		<div
			class="{spanClass(widget.size)} relative {editMode ? 'cursor-grab' : ''} {dragId === widget.id ? 'opacity-40' : ''} {dropTargetId === widget.id ? 'ring-2 ring-primary ring-offset-2 ring-offset-background rounded-lg' : ''}"
			draggable={editMode}
			ondragstart={(e) => handleDragStart(e, widget.id)}
			ondragover={(e) => handleDragOver(e, widget.id)}
			ondrop={(e) => handleDrop(e, widget.id)}
			ondragend={handleDragEnd}
		>
			{#if editMode}
				<div class="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-md border border-border bg-background/95 p-1 shadow-sm backdrop-blur">
					<span class="flex h-7 w-6 cursor-grab items-center justify-center text-muted-foreground" title="Drag to reorder">
						<GripVertical size={14} />
					</span>
					{#if widget.sizes.length > 1}
						<div class="flex items-center rounded-sm bg-muted/40 p-0.5">
							{#each widget.sizes as size}
								<button
									type="button"
									class="h-5 px-1.5 text-[10px] font-semibold uppercase {widget.size === size ? 'bg-primary text-primary-foreground rounded-sm' : 'text-muted-foreground hover:text-foreground'}"
									onclick={() => changeSize(widget.id, size)}
								>
									{size}
								</button>
							{/each}
						</div>
					{/if}
					<button
						type="button"
						class="flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
						onclick={() => hideWidget(widget.id)}
						title="Hide widget"
					>
						<EyeOff size={13} />
					</button>
				</div>
				<div class="pointer-events-none absolute inset-0 z-[1] rounded-lg ring-1 ring-dashed ring-primary/30"></div>
			{/if}

			<WidgetHost {widget} />
		</div>
	{/each}

	{#if editMode && onAddClick}
		<button
			type="button"
			class="col-span-2 row-span-1 flex min-h-[140px] flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-muted/20 p-6 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted/40 hover:text-foreground"
			onclick={() => onAddClick?.()}
		>
			<Plus size={20} />
			<span class="text-[12px] font-medium">Add a widget</span>
		</button>
	{/if}
</div>

{#if visibleWidgets.length === 0 && !editMode}
	<div class="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 py-16 text-center">
		<p class="text-sm font-medium text-foreground">Your dashboard is empty</p>
		<p class="mt-1 text-xs text-muted-foreground">Click the pencil icon above to add widgets</p>
	</div>
{/if}
