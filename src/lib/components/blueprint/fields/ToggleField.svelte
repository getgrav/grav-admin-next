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

	const isBool = field.validate?.type === 'bool';
	const currentValue = $derived(
		value !== undefined ? value : field.default
	);
	const isOn = $derived(
		isBool ? !!currentValue : currentValue == field.highlight
	);
</script>

<label class="flex cursor-pointer items-center justify-between gap-4">
	<div class="min-w-0">
		<span class="text-sm font-medium text-foreground">
			{translateLabel(field.label)}
		</span>
		{#if field.help}
			<span class="ml-1 text-xs text-muted-foreground">({translateLabel(field.help)})</span>
		{/if}
		{#if field.description}
			<p class="mt-0.5 text-xs text-muted-foreground">{translateLabel(field.description)}</p>
		{/if}
	</div>
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
				onchange(checked ? (field.highlight ?? 1) : 0);
			}
		}}
	/>
</label>
