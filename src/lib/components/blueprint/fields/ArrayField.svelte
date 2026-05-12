<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { resolveDataOptions } from '$lib/api/endpoints/data';
	import { ChevronsUpDown, GripVertical, Plus, X } from 'lucide-svelte';

	interface Props {
		field: BlueprintField;
		value: unknown;
		onchange: (value: unknown) => void;
	}

	let { field, value, onchange }: Props = $props();
	const translateLabel = i18n.tMaybe;

	const valueOnly = field.value_only ?? false;
	const placeholderKey = field.placeholder_key ? translateLabel(field.placeholder_key) : 'Key';
	const placeholderValue = field.placeholder_value ? translateLabel(field.placeholder_value) : 'Value';

	// When create === false, the value input is a constrained <select> sourced
	// from `options` / `data_options`. The "Add" button still works — it
	// inserts a row with an empty value the user then picks from the dropdown.
	const constrained = field.create === false;
	let resolvedOptions = $state<Array<{ value: string; label: string }>>([]);

	$effect(() => {
		if (constrained && field.data_options && (!field.options || field.options.length === 0)) {
			resolveDataOptions(field.data_options).then((opts) => {
				resolvedOptions = opts;
			});
		}
	});

	const valueOptions = $derived(
		field.options && field.options.length > 0 ? field.options : resolvedOptions
	);

	// When constrained, drop any saved entries whose value isn't in the
	// resolved option list — they reference something not installed in this
	// Grav instance (e.g. 'ably' on a site without sync-ably). Filtering on
	// render also re-emits the cleaned list so saving persists what the user
	// can actually see.
	$effect(() => {
		if (!constrained || valueOptions.length === 0) return;
		const valid = new Set(valueOptions.map((o) => o.value));
		const filtered = entries.filter((e) => e.value === '' || valid.has(e.value));
		if (filtered.length !== entries.length) {
			entries = filtered;
			emitChange();
		}
	});

	// When constrained, hide "Add" once every available option is in the list —
	// there's nothing left to pick. Falsy until options have loaded so the
	// button isn't temporarily hidden mid-resolve.
	const canAdd = $derived(!constrained || (valueOptions.length > 0 && entries.length < valueOptions.length));

	// Internal representation: always work with an array of {key, value} pairs
	interface Entry {
		id: number;
		key: string;
		value: string;
	}

	let nextId = $state(0);

	function parseEntries(val: unknown): Entry[] {
		if (val === null || val === undefined) return [];

		if (valueOnly) {
			// value_only: stored as an array of strings
			const arr = Array.isArray(val) ? val : [];
			return arr.map((v) => ({ id: nextId++, key: '', value: String(v ?? '') }));
		}

		// Key-value: stored as an object
		if (typeof val === 'object' && !Array.isArray(val)) {
			return Object.entries(val as Record<string, unknown>).map(([k, v]) => ({
				id: nextId++,
				key: k,
				value: String(v ?? '')
			}));
		}

		return [];
	}

	let entries = $state<Entry[]>(parseEntries(value));

	// Sync entries when external value prop changes (e.g., on initial load inside a list)
	let lastExternalJson = $state(JSON.stringify(value));
	$effect(() => {
		const current = JSON.stringify(value);
		if (current !== lastExternalJson) {
			lastExternalJson = current;
			entries = parseEntries(value);
		}
	});

	function emitChange() {
		if (valueOnly) {
			const val = entries.map((e) => e.value);
			lastExternalJson = JSON.stringify(val);
			onchange(val);
		} else {
			const obj: Record<string, string> = {};
			for (const e of entries) {
				if (e.key) obj[e.key] = e.value;
			}
			lastExternalJson = JSON.stringify(obj);
			onchange(obj);
		}
	}

	function addEntry() {
		entries = [...entries, { id: nextId++, key: '', value: '' }];
		// Don't emit yet - wait for user to type
	}

	function removeEntry(id: number) {
		entries = entries.filter((e) => e.id !== id);
		emitChange();
	}

	function updateKey(id: number, key: string) {
		entries = entries.map((e) => (e.id === id ? { ...e, key } : e));
		emitChange();
	}

	function updateValue(id: number, val: string) {
		entries = entries.map((e) => (e.id === id ? { ...e, value: val } : e));
		emitChange();
	}

	// Drag & drop reordering
	let dragIndex = $state<number | null>(null);
	let dragOverIndex = $state<number | null>(null);

	function handleDragStart(index: number) {
		dragIndex = index;
	}

	function handleDragOver(e: DragEvent, index: number) {
		e.preventDefault();
		dragOverIndex = index;
	}

	function handleDrop(index: number) {
		if (dragIndex !== null && dragIndex !== index) {
			const reordered = [...entries];
			const [moved] = reordered.splice(dragIndex, 1);
			reordered.splice(index, 0, moved);
			entries = reordered;
			emitChange();
		}
		dragIndex = null;
		dragOverIndex = null;
	}

	function handleDragEnd() {
		dragIndex = null;
		dragOverIndex = null;
	}
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
				<p class="mt-0.5 text-xs text-muted-foreground">{@html translateLabel(field.help)}</p>
			{/if}
		</div>
	{/if}

	<div class="space-y-1">
		{#each entries as entry, index (entry.id)}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="group flex items-center gap-1.5 rounded-lg transition-colors
					{dragOverIndex === index && dragIndex !== index ? 'border-t-2 border-primary' : ''}"
				draggable="true"
				ondragstart={() => handleDragStart(index)}
				ondragover={(e) => handleDragOver(e, index)}
				ondrop={() => handleDrop(index)}
				ondragend={handleDragEnd}
			>
				<!-- Drag handle -->
				<span
					class="flex shrink-0 cursor-grab items-center text-muted-foreground/40 transition-colors group-hover:text-muted-foreground active:cursor-grabbing"
				>
					<GripVertical size={14} />
				</span>

				<!-- Key input (when not value_only) -->
				{#if !valueOnly}
					<input
						type="text"
						class="flex h-9 w-1/3 shrink-0 rounded-lg border border-input bg-muted/50 px-3 py-1.5 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
						value={entry.key}
						placeholder={placeholderKey}
						oninput={(e) => updateKey(entry.id, (e.target as HTMLInputElement).value)}
					/>
				{/if}

				<!-- Value input — constrained <select> when create === false,
				     otherwise a free-form text input. -->
				{#if constrained}
					<div class="relative flex min-w-0 flex-1 items-center">
						<select
							class="flex h-9 w-full appearance-none rounded-lg border border-input bg-muted/50 pl-3 pr-8 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
							value={entry.value}
							onchange={(e) => updateValue(entry.id, (e.target as HTMLSelectElement).value)}
						>
							<option value="" disabled={entry.value !== ''}>{placeholderValue}</option>
							{#each valueOptions as opt (opt.value)}
								<option value={opt.value} selected={entry.value === opt.value}>{translateLabel(opt.label)}</option>
							{/each}
						</select>
						<div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5">
							<ChevronsUpDown size={14} class="text-muted-foreground" />
						</div>
					</div>
				{:else}
					<input
						type="text"
						class="flex h-9 min-w-0 flex-1 rounded-lg border border-input bg-muted/50 px-3 py-1.5 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
						value={entry.value}
						placeholder={placeholderValue}
						oninput={(e) => updateValue(entry.id, (e.target as HTMLInputElement).value)}
					/>
				{/if}

				<!-- Remove button -->
				<button
					type="button"
					class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/40 transition-colors hover:bg-red-500/10 hover:text-red-400"
					onclick={() => removeEntry(entry.id)}
					title={i18n.t('ADMIN_NEXT.REMOVE')}
				>
					<X size={14} />
				</button>
			</div>
		{/each}
	</div>

	<!-- Add button — hidden when constrained and every option is already
	     in the list (nothing left to pick). -->
	{#if canAdd}
		<button
			type="button"
			class="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
			onclick={addEntry}
		>
			<Plus size={14} />
			Add {valueOnly ? 'item' : 'entry'}
		</button>
	{/if}
</div>
