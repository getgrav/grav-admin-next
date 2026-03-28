<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import FieldRenderer from '../FieldRenderer.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';

	interface Props {
		field: BlueprintField;
		getValue: (path: string) => unknown;
		onFieldChange: (path: string, value: unknown) => void;
	}

	let { field, getValue, onFieldChange }: Props = $props();
	const translateLabel = i18n.tMaybe;
</script>

<div class="rounded-lg border border-border">
	{#if field.title || field.label}
		<div class="border-b border-border px-5 py-3">
			<h3 class="text-sm font-semibold text-foreground">
				{translateLabel(field.title || field.label)}
			</h3>
			{#if field.description}
				<p class="mt-0.5 text-xs text-muted-foreground">{translateLabel(field.description)}</p>
			{/if}
		</div>
	{/if}

	{#if field.fields}
		<div class="divide-y divide-border">
			{#each field.fields as childField (childField.name)}
				<div class="px-5 py-3">
					<FieldRenderer
						field={childField}
						value={getValue(childField.name)}
						onchange={(val) => onFieldChange(childField.name, val)}
						{getValue}
						{onFieldChange}
					/>
				</div>
			{/each}
		</div>
	{/if}
</div>
