<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import CodeEditor from '$lib/components/editors/CodeEditor.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';

	interface Props {
		field: BlueprintField;
		value: unknown;
		onchange: (value: unknown) => void;
	}

	let { field, value, onchange }: Props = $props();
	const translateLabel = i18n.tMaybe;

	const stringValue = $derived(typeof value === 'string' ? value : '');
</script>

<div class="space-y-2">
	{#if field.label || field.help}
		<div>
			{#if field.label}
				<label class="text-sm font-semibold text-foreground">
					{translateLabel(field.label)}
				</label>
			{/if}
			{#if field.help}
				<p class="mt-0.5 text-xs text-muted-foreground">{translateLabel(field.help)}</p>
			{/if}
		</div>
	{/if}
	<CodeEditor
		value={stringValue}
		onchange={(v) => onchange(v)}
		language="yaml"
		minHeight="200px"
		maxHeight="600px"
		disabled={field.disabled}
		readonly={field.readonly}
	/>
</div>
