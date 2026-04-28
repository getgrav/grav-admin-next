<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import FieldRenderer from '../FieldRenderer.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { GripVertical, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-svelte';

	interface Props {
		field: BlueprintField;
		value: unknown;
		onchange: (value: unknown) => void;
		getValue: (path: string) => unknown;
		onFieldChange: (path: string, value: unknown) => void;
		onFieldCommit?: (path: string, value: unknown, oldValue?: unknown) => void;
		filter?: string;
	}

	let { field, value, onchange, getValue, onFieldChange, onFieldCommit, filter = '' }: Props = $props();
	const translateLabel = i18n.tMaybe;

	const childFields = $derived(field.fields ?? []);
	const isCollapsible = $derived(childFields.length > 1 && field.collapsible !== false);
	const sortable = $derived(field.sort !== false);
	const btnLabel = $derived(field.btnLabel ? translateLabel(field.btnLabel) : 'Add item');
	const isCompact = $derived((field.classes ?? '').includes('compact'));

	// Detect if this list uses key-value pairs (has a field with type 'key')
	const keyFieldDef = $derived(childFields.find((f) => f.type === 'key'));
	const valueFieldDefs = $derived(childFields.filter((f) => f.type !== 'key'));

	interface ListItem {
		id: number;
		key: string;
		data: Record<string, unknown>;
		collapsed: boolean;
	}

	let nextId = 0;

	function parseItems(val: unknown): ListItem[] {
		if (val === null || val === undefined) return [];

		if (Array.isArray(val)) {
			return val.map((item) => ({
				id: nextId++,
				key: '',
				data: (typeof item === 'object' && item !== null && !Array.isArray(item))
					? (item as Record<string, unknown>)
					: { value: item },
				collapsed: !!field.collapsed
			}));
		}

		if (typeof val === 'object') {
			return Object.entries(val as Record<string, unknown>).map(([k, v]) => ({
				id: nextId++,
				key: k,
				data: (typeof v === 'object' && v !== null && !Array.isArray(v))
					? (v as Record<string, unknown>)
					: { value: v },
				collapsed: !!field.collapsed
			}));
		}

		return [];
	}

	let items = $state<ListItem[]>(parseItems(value));

	// Re-sync items when the external value prop changes (e.g., page reload)
	let lastExternalJson = $state(JSON.stringify(value));
	$effect(() => {
		const current = JSON.stringify(value);
		if (current !== lastExternalJson) {
			lastExternalJson = current;
			items = parseItems(value);
		}
	});

	function emitChange() {
		let payload: unknown;
		if (keyFieldDef) {
			// Key-value mode: emit as object keyed by the key field
			const obj: Record<string, unknown> = {};
			for (const item of items) {
				const k = item.key || String(item.id);
				obj[k] = valueFieldDefs.length === 1 ? getItemFieldValue(item, valueFieldDefs[0]) : item.data;
			}
			payload = obj;
		} else {
			// Array mode: emit as array
			payload = items.map((item) => {
				if (valueFieldDefs.length === 1) {
					return getItemFieldValue(item, valueFieldDefs[0]);
				}
				return { ...item.data };
			});
		}
		// Remember what we just emitted so the $effect below can tell our own
		// round-trip apart from a truly external change. Without this, every
		// keystroke would re-parse `value` into fresh items — minting new
		// `id`s (breaking the keyed {#each}, dropping focus) and resetting
		// `collapsed` to the field default (collapsing the open editor).
		lastExternalJson = JSON.stringify(payload);
		onchange(payload);
	}

	function getItemFieldValue(item: ListItem, fieldDef: BlueprintField): unknown {
		// Extract the leaf name from the full field path
		const leafName = fieldDef.name.split('.').pop() ?? fieldDef.name;
		return item.data[leafName];
	}

	function setItemFieldValue(item: ListItem, fieldDef: BlueprintField, val: unknown) {
		const leafName = fieldDef.name.split('.').pop() ?? fieldDef.name;
		item.data = { ...item.data, [leafName]: val };
	}

	function addItem() {
		const newItem: ListItem = {
			id: nextId++,
			key: '',
			data: {},
			collapsed: false
		};
		items = [...items, newItem];
		emitChange();
	}

	function removeItem(id: number) {
		items = items.filter((item) => item.id !== id);
		emitChange();
	}

	function toggleCollapse(id: number) {
		items = items.map((item) =>
			item.id === id ? { ...item, collapsed: !item.collapsed } : item
		);
	}

	function expandAll() {
		items = items.map((item) => ({ ...item, collapsed: false }));
	}

	function collapseAll() {
		items = items.map((item) => ({ ...item, collapsed: true }));
	}

	function handleItemKeyChange(item: ListItem, val: string) {
		items = items.map((it) => (it.id === item.id ? { ...it, key: val } : it));
		emitChange();
	}

	function handleItemFieldChange(item: ListItem, fieldDef: BlueprintField, val: unknown) {
		items = items.map((it) => {
			if (it.id !== item.id) return it;
			const updated = { ...it };
			setItemFieldValue(updated, fieldDef, val);
			return updated;
		});
		emitChange();
	}

	// Drag reorder
	let dragIndex = $state<number | null>(null);
	let dragOverIndex = $state<number | null>(null);

	function handleDragStart(index: number) { dragIndex = index; }
	function handleDragOver(e: DragEvent, index: number) { e.preventDefault(); dragOverIndex = index; }
	function handleDrop(index: number) {
		if (dragIndex !== null && dragIndex !== index) {
			const reordered = [...items];
			const [moved] = reordered.splice(dragIndex, 1);
			reordered.splice(index, 0, moved);
			items = reordered;
			emitChange();
		}
		dragIndex = null;
		dragOverIndex = null;
	}
	function handleDragEnd() { dragIndex = null; dragOverIndex = null; }

	// Summary label for collapsed items
	function itemSummary(item: ListItem): string {
		if (keyFieldDef && item.key) return item.key;
		const vals = Object.values(item.data).filter((v) => typeof v === 'string' && v);
		return vals.length > 0 ? String(vals[0]) : `Item`;
	}

	// Filter support — match item key or any string-y data value
	const filterQ = $derived(filter.trim().toLowerCase());
	const isFiltering = $derived(filterQ.length > 0);

	function itemMatches(item: ListItem, q: string): boolean {
		if (!q) return true;
		if (item.key && item.key.toLowerCase().includes(q)) return true;
		for (const v of Object.values(item.data)) {
			if (v == null) continue;
			if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
				if (String(v).toLowerCase().includes(q)) return true;
			}
		}
		return false;
	}

	const visibleItems = $derived(
		isFiltering ? items.filter((it) => itemMatches(it, filterQ)) : items
	);
</script>

<div class="space-y-2">
	{#if field.label || field.help}
		<div>
			{#if field.label}
				<label class="text-sm font-semibold text-foreground">
					{translateLabel(field.label)}
				</label>
			{/if}
			{#if field.help}
				<p class="mt-0.5 text-xs text-muted-foreground">{translateLabel(field.help)}</p>
			{/if}
		</div>
	{/if}

	{#if visibleItems.length > 0}
		<div class="space-y-2">
			{#each visibleItems as item, index (item.id)}
				{@const expanded = !item.collapsed || isFiltering}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="rounded-lg border border-border bg-card transition-colors
						{dragOverIndex === index && dragIndex !== index ? 'border-primary' : ''}"
					draggable={sortable && !isFiltering}
					ondragstart={() => handleDragStart(index)}
					ondragover={(e) => handleDragOver(e, index)}
					ondrop={() => handleDrop(index)}
					ondragend={handleDragEnd}
				>
					<!-- Item header -->
					<div class="flex items-center gap-1.5 px-3 py-2">
						{#if sortable}
							<span class="flex shrink-0 cursor-grab items-center text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing">
								<GripVertical size={14} />
							</span>
						{/if}

						{#if isCollapsible}
							<button
								type="button"
								class="flex shrink-0 items-center text-muted-foreground hover:text-foreground"
								onclick={() => toggleCollapse(item.id)}
							>
								{#if item.collapsed}
									<ChevronRight size={14} />
								{:else}
									<ChevronDown size={14} />
								{/if}
							</button>
						{/if}

						{#if !expanded}
							<span class="min-w-0 flex-1 truncate text-sm text-muted-foreground">{itemSummary(item)}</span>
						{:else}
							<span class="flex-1"></span>
						{/if}

						<button
							type="button"
							class="flex shrink-0 items-center rounded-md p-1 text-muted-foreground/40 transition-colors hover:bg-red-500/10 hover:text-red-400"
							onclick={() => removeItem(item.id)}
							title={i18n.t('ADMIN_NEXT.REMOVE')}
						>
							<Trash2 size={14} />
						</button>
					</div>

					<!-- Item fields (when expanded) -->
					{#if expanded}
						<div class="{isCompact ? 'grid grid-cols-2 gap-x-4 gap-y-3' : 'space-y-4'} border-t border-border px-4 py-3">
							{#if keyFieldDef}
								<div class="space-y-2 {isCompact ? 'col-span-2' : ''}">
									{#if keyFieldDef.label}
										<label class="text-sm font-semibold text-foreground">
											{translateLabel(keyFieldDef.label)}
										</label>
									{/if}
									<input
										type="text"
										class="flex h-10 w-full rounded-lg border border-input bg-muted/50 px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
										value={item.key}
										placeholder={keyFieldDef.placeholder ? translateLabel(keyFieldDef.placeholder) : ''}
										oninput={(e) => handleItemKeyChange(item, (e.target as HTMLInputElement).value)}
									/>
								</div>
							{/if}

							{#each valueFieldDefs as childField (childField.name)}
								<FieldRenderer
									field={childField}
									value={getItemFieldValue(item, childField)}
									onchange={(val) => handleItemFieldChange(item, childField, val)}
									oncommit={onFieldCommit ? (val: unknown, old?: unknown) => onFieldCommit(childField.name, val, old) : undefined}
									{getValue}
									{onFieldChange}
									{onFieldCommit}
								/>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<!-- Actions bar -->
	<div class="flex items-center gap-2">
		{#if isCollapsible && items.length > 1}
			<button
				type="button"
				class="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
				onclick={expandAll}
			>
				<ChevronDown size={12} /> {i18n.t('ADMIN_NEXT.EXPAND_ALL')}
			</button>
			<button
				type="button"
				class="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
				onclick={collapseAll}
			>
				<ChevronRight size={12} /> {i18n.t('ADMIN_NEXT.COLLAPSE_ALL')}
			</button>
		{/if}
		<button
			type="button"
			class="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
			onclick={addItem}
		>
			<Plus size={14} />
			{btnLabel}
		</button>
	</div>
</div>
