<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';

	interface Props {
		field: BlueprintField;
		value: unknown;
		onchange: (value: unknown) => void;
		translateLabel: (label: string | undefined) => string;
	}

	let { field, value, onchange, translateLabel }: Props = $props();

	const isCode = field.type === 'markdown' || field.type === 'editor' || field.yaml;
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
		<span class="text-xs text-muted-foreground">{translateLabel(field.help)}</span>
	{/if}
</label>
