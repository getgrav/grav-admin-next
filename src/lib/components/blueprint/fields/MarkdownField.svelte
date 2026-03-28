<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { i18n } from '$lib/stores/i18n.svelte';
	import MarkdownEditor from '$lib/components/editors/MarkdownEditor.svelte';

	interface Props {
		field: BlueprintField;
		value: unknown;
		onchange: (value: unknown) => void;
	}

	let { field, value, onchange }: Props = $props();
	const translateLabel = i18n.tMaybe;
</script>

<div class="space-y-2">
	{#if field.label}
		<span class="text-sm font-medium text-foreground">
			{translateLabel(field.label)}
			{#if field.validate?.required}
				<span class="text-red-500">*</span>
			{/if}
		</span>
	{/if}
	<MarkdownEditor
		value={typeof value === 'string' ? value : (value != null ? String(value) : (typeof field.default === 'string' ? field.default : ''))}
		onchange={(v) => onchange(v)}
		placeholder={translateLabel(field.placeholder) ?? ''}
		minHeight={field.rows ? `${field.rows * 24}px` : '300px'}
		disabled={field.disabled}
		readonly={field.readonly}
	/>
	{#if field.help}
		<span class="text-xs text-muted-foreground">{translateLabel(field.help)}</span>
	{/if}
</div>
