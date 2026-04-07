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

	const currentValue = $derived(typeof value === 'string' ? value : (field.default as string) ?? '');

	// The child fields that are type: element — each one maps to a select option
	const elementFields = $derived(
		(field.fields ?? []).filter((f) => f.type === 'element')
	);

	// The active element's child fields (shown based on select value).
	// Element names may be numeric (from YAML integer keys) while select values are strings.
	const activeElement = $derived(
		elementFields.find((f) => String(f.name) === currentValue)
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
