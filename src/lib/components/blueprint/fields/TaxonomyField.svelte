<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { api } from '$lib/api/client';
	import SelectizeField from './SelectizeField.svelte';

	interface Props {
		field: BlueprintField;
		value: unknown;
		onchange: (value: unknown) => void;
	}

	let { field, value, onchange }: Props = $props();
	const translateLabel = i18n.tMaybe;

	/** Taxonomy types and their known values from the API */
	let taxonomyMap = $state<Record<string, string[]>>({});
	let loaded = $state(false);

	/** Parse the taxonomy value — expects Record<string, string[]> */
	function parseTaxonomy(val: unknown): Record<string, string[]> {
		if (val && typeof val === 'object' && !Array.isArray(val)) {
			const result: Record<string, string[]> = {};
			for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
				if (Array.isArray(v)) result[k] = v.map(String);
				else if (typeof v === 'string') result[k] = v.split(',').map((s) => s.trim()).filter(Boolean);
				else result[k] = [];
			}
			return result;
		}
		return {};
	}

	const taxonomyValue = $derived(parseTaxonomy(value));

	// Fetch taxonomy types and values once
	$effect(() => {
		api.get<Record<string, string[]>>('/taxonomy')
			.then((data) => {
				taxonomyMap = data;
				loaded = true;
			})
			.catch(() => {
				loaded = true;
			});
	});

	/** All taxonomy type names — merge API types + any already in value */
	const taxonomyTypes = $derived.by(() => {
		const types = new Set(Object.keys(taxonomyMap));
		for (const k of Object.keys(taxonomyValue)) types.add(k);
		return [...types].sort();
	});

	function updateType(type: string, tags: unknown) {
		const arr = Array.isArray(tags) ? tags.filter(Boolean) : [];
		const next = { ...taxonomyValue };
		if (arr.length > 0) {
			next[type] = arr as string[];
		} else {
			delete next[type];
		}
		onchange(Object.keys(next).length > 0 ? next : undefined);
	}

	/** Build a pseudo-BlueprintField for each taxonomy type's SelectizeField */
	function fieldForType(type: string): BlueprintField {
		return {
			name: type,
			type: 'selectize',
			label: type.charAt(0).toUpperCase() + type.slice(1),
			placeholder: `Add ${type}...`,
			options: (taxonomyMap[type] ?? []).map((v) => ({ value: v, label: v })),
			validate: { type: 'array' }
		};
	}
</script>

<div class="space-y-2">
	{#if field.label || field.help}
		<div>
			{#if field.label}
				<span class="text-sm font-semibold text-foreground">
					{translateLabel(field.label)}
				</span>
			{/if}
			{#if field.help}
				<p class="mt-0.5 text-xs text-muted-foreground">{translateLabel(field.help)}</p>
			{/if}
		</div>
	{/if}

	{#if !loaded}
		<div class="h-10 animate-pulse rounded-lg bg-muted/50"></div>
	{:else}
		<div class="space-y-3">
			{#each taxonomyTypes as type (type)}
				<SelectizeField
					field={fieldForType(type)}
					value={taxonomyValue[type] ?? []}
					onchange={(tags) => updateType(type, tags)}
				/>
			{/each}
			{#if taxonomyTypes.length === 0}
				<p class="text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.FIELDS.NO_TAXONOMY_TYPES')}</p>
			{/if}
		</div>
	{/if}
</div>
