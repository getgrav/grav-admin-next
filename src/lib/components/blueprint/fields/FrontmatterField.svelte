<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import CodeEditor from '$lib/components/editors/CodeEditor.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import FieldHelp from '../FieldHelp.svelte';

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
			<FieldHelp help={field.help} label={field.label} />
		</div>
	{/if}
	<CodeEditor
		value={stringValue}
		onchange={(v) => onchange(v)}
		language="yaml"
		maxHeight="600px"
		disabled={field.disabled}
		readonly={field.readonly}
	/>
</div>
