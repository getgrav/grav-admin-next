<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';

	interface Props {
		field: BlueprintField;
		value: unknown;
		onchange: (value: unknown) => void;
		translateLabel: (label: string | undefined) => string;
	}

	let { field, value, onchange, translateLabel }: Props = $props();

	const isBool = field.validate?.type === 'bool';
	const currentValue = $derived(
		value !== undefined ? value : field.default
	);
	const isOn = $derived(
		isBool ? !!currentValue : currentValue == field.highlight
	);
</script>

<div class="flex items-center justify-between">
	<span class="text-sm text-foreground">
		{translateLabel(field.label)}
		{#if field.help}
			<span class="ml-1 text-xs text-muted-foreground">({translateLabel(field.help)})</span>
		{/if}
	</span>
	<input
		type="checkbox"
		class="switch"
		checked={isOn}
		disabled={field.disabled}
		onchange={(e) => {
			const checked = (e.target as HTMLInputElement).checked;
			if (isBool) {
				onchange(checked);
			} else {
				// Toggle between highlight value and 0
				onchange(checked ? (field.highlight ?? 1) : 0);
			}
		}}
	/>
</div>
