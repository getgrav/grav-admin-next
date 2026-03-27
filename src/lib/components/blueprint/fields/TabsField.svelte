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

	const tabs = $derived((field.fields ?? []).filter((f) => f.type === 'tab' || f.fields));
	let activeIndex = $state(0);
</script>

<div>
	<!-- Tab headers -->
	<div class="flex gap-1 border-b border-border">
		{#each tabs as tab, i (tab.name)}
			<button
				class="border-b-2 px-4 py-2 text-sm font-medium transition-colors
					{i === activeIndex
						? 'border-primary text-primary'
						: 'border-transparent text-muted-foreground hover:text-foreground'}"
				onclick={() => activeIndex = i}
			>
				{translateLabel(tab.title || tab.label || tab.name)}
			</button>
		{/each}
	</div>

	<!-- Active tab content -->
	{#each tabs as tab, i (tab.name)}
		{#if i === activeIndex && tab.fields}
			<div class="space-y-4 pt-4">
				{#each tab.fields as childField (childField.name)}
					<FieldRenderer
						field={childField}
						value={getValue(childField.name)}
						onchange={(val) => onFieldChange(childField.name, val)}
						{getValue}
						{onFieldChange}
					/>
				{/each}
			</div>
		{/if}
	{/each}
</div>
