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

	const isCode = field.yaml;
</script>

<div class="space-y-1.5">
	{#if field.label}
		<span class="text-sm font-medium text-foreground">
			{translateLabel(field.label)}
			{#if field.validate?.required}
				<span class="text-red-500">*</span>
			{/if}
		</span>
	{/if}
	<textarea
		class="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring {isCode ? 'font-mono' : ''}"
		rows={field.rows ?? (isCode ? 12 : 4)}
		value={value ?? field.default ?? ''}
		placeholder={translateLabel(field.placeholder)}
		disabled={field.disabled}
		readonly={field.readonly}
		oninput={(e) => onchange((e.target as HTMLTextAreaElement).value)}
		style="resize: vertical;"
	></textarea>
	{#if field.help}
		<p class="text-xs text-muted-foreground">{translateLabel(field.help)}</p>
	{/if}
</div>
