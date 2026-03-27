<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import FieldRenderer from '../FieldRenderer.svelte';

	interface Props {
		field: BlueprintField;
		getValue: (path: string) => unknown;
		onFieldChange: (path: string, value: unknown) => void;
		translateLabel: (label: string | undefined) => string;
	}

	let { field, getValue, onFieldChange, translateLabel }: Props = $props();
</script>

<div class="space-y-3">
	{#if field.title || field.label}
		<div class="{field.underline ? 'border-b border-border pb-2' : ''}">
			<h3 class="text-sm font-semibold text-foreground">
				{translateLabel(field.title || field.label)}
			</h3>
		</div>
	{/if}

	{#if field.fields}
		{#each field.fields as childField (childField.name)}
			<FieldRenderer
				field={childField}
				value={getValue(childField.name)}
				onchange={(val) => onFieldChange(childField.name, val)}
				{getValue}
				{onFieldChange}
			/>
		{/each}
	{/if}
</div>
