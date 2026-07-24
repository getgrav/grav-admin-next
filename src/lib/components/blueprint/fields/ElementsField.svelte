<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import FieldRenderer from '../FieldRenderer.svelte';
	import SelectField from './SelectField.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';

	interface Props {
		field: BlueprintField;
		value: unknown;
		onchange: (value: unknown) => void;
		getValue: (path: string) => unknown;
		onFieldChange: (path: string, value: unknown) => void;
		onFieldCommit?: (path: string, value: unknown, oldValue?: unknown) => void;
	}

	let { field, value, onchange, getValue, onFieldChange, onFieldCommit }: Props = $props();

	// Element keys are compared as strings, but a saved value arrives from YAML
	// with its native type — `enabled: 1` deserializes to the number 1, and a
	// `validate: type: bool` field can arrive as a boolean. Every scalar is
	// normalized rather than discarded, otherwise a page that has the feature
	// turned on falls back to the field default and renders as off, hiding all
	// of the element's child fields (getgrav/grav-premium-issues#609).
	const toKey = (v: unknown): string | null => {
		if (v === null || v === undefined || typeof v === 'object') return null;
		if (typeof v === 'boolean') return v ? '1' : '0';
		return String(v);
	};

	const currentValue = $derived(toKey(value) ?? toKey(field.default) ?? '');

	// The child fields that are type: element — each one maps to a select option
	const elementFields = $derived(
		(field.fields ?? []).filter((f) => f.type === 'element')
	);

	// An element's key as the select dropdown reports it. The API serializes a
	// nested field's `name` as its full dotted path (`header.links.external`),
	// but the select value is always the bare element key (`external`), so we
	// compare the leaf segment — admin-classic's `plain_name` semantics, which
	// keep these keys bare at any depth. At top level the two are identical;
	// only nesting (e.g. `elements` inside a `list`) diverges (admin2#130).
	// Names may also be numeric (from YAML integer keys), hence the String().
	const elementKey = (f: BlueprintField): string => {
		const name = String(f.name);
		return name.split('.').pop() ?? name;
	};

	// The active element's child fields (shown based on select value).
	const activeElement = $derived(
		elementFields.find((f) => elementKey(f) === currentValue)
	);
</script>

<div class="space-y-3">
	<!-- The select dropdown (reuse SelectField for consistency) -->
	<SelectField {field} value={currentValue} {onchange} />

	<!-- Show the active element's child fields -->
	{#if activeElement?.fields}
		<div class="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
			{#each activeElement.fields as childField (childField.name)}
				<FieldRenderer
					field={childField}
					value={getValue(childField.name)}
					onchange={(val) => onFieldChange(childField.name, val)}
					oncommit={onFieldCommit ? (val: unknown, old?: unknown) => onFieldCommit(childField.name, val, old) : undefined}
					{getValue}
					{onFieldChange}
					{onFieldCommit}
				/>
			{/each}
		</div>
	{/if}
</div>
