<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { api } from '$lib/api/client';
	import SelectizeField from './SelectizeField.svelte';
	import FieldHelp from '../FieldHelp.svelte';
	import {
		normalizeTaxonomyMap,
		parseTaxonomy,
		taxonomyOptions,
		withTaxonomyType
	} from '$lib/utils/taxonomy';

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

	/** The page's own values per type, as lists of strings for display. */
	const taxonomyValue = $derived(parseTaxonomy(value));

	// Fetch taxonomy types and values once. The reply is normalised to strings
	// before anything draws from it: a number in it used to throw while the
	// field was being drawn and left the placeholder below on screen (admin2#186).
	$effect(() => {
		api.get<unknown>('/taxonomy')
			.then((data) => {
				taxonomyMap = normalizeTaxonomyMap(data);
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
		// Only the edited type changes; the rest of the block goes back as the
		// author wrote it. A cleared type is an explicit empty list (admin2#140).
		onchange(withTaxonomyType(value, type, tags));
	}

	/** Build a pseudo-BlueprintField for each taxonomy type's SelectizeField */
	function fieldForType(type: string): BlueprintField {
		return {
			name: type,
			type: 'selectize',
			label: type.charAt(0).toUpperCase() + type.slice(1),
			placeholder: `Add ${type}...`,
			options: taxonomyOptions(taxonomyMap[type] ?? []),
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
			<FieldHelp help={field.help} label={field.label} />
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
