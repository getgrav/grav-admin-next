<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { i18n } from '$lib/stores/i18n.svelte';

	interface Props {
		field: BlueprintField;
		value: unknown;
		onchange: (value: unknown) => void;
	}

	let { field, value, onchange }: Props = $props();
	const translateLabel = i18n.tMaybe;
</script>

<label class="label">
	{#if field.label}
		<span class="text-sm font-medium text-foreground">
			{translateLabel(field.label)}
			{#if field.validate?.required}
				<span class="text-red-500">*</span>
			{/if}
		</span>
	{/if}
	<select
		class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
		value={value ?? field.default ?? ''}
		onchange={(e) => onchange((e.target as HTMLSelectElement).value)}
		disabled={field.disabled}
	>
		{#if !field.validate?.required}
			<option value="">— Select —</option>
		{/if}
		{#if field.options}
			{#each Object.entries(field.options) as [val, label]}
				<option value={val} selected={String(value ?? field.default) === String(val)}>{translateLabel(label)}</option>
			{/each}
		{/if}
	</select>
	{#if field.help}
		<span class="text-xs text-muted-foreground">{translateLabel(field.help)}</span>
	{/if}
</label>
