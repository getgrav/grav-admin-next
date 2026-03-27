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

	const inputType = field.type === 'number' ? 'number' : field.type === 'color' ? 'color' : field.type === 'range' ? 'range' : field.type === 'password' ? 'password' : field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : field.type === 'date' ? 'date' : field.type === 'datetime' ? 'datetime-local' : field.type === 'time' ? 'time' : 'text';

	function handleInput(e: Event) {
		const target = e.target as HTMLInputElement;
		const v = field.type === 'number' ? (target.value ? Number(target.value) : undefined) : target.value;
		onchange(v);
	}
</script>

{#if field.type !== 'hidden'}
	<label class="label">
		{#if field.label}
			<span class="text-sm font-medium text-foreground">
				{translateLabel(field.label)}
				{#if field.validate?.required}
					<span class="text-red-500">*</span>
				{/if}
			</span>
		{/if}
		<input
			type={inputType}
			class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
			value={value ?? field.default ?? ''}
			placeholder={translateLabel(field.placeholder)}
			disabled={field.disabled}
			readonly={field.readonly}
			min={field.min}
			max={field.max}
			step={field.step}
			oninput={handleInput}
		/>
		{#if field.help}
			<span class="text-xs text-muted-foreground">{translateLabel(field.help)}</span>
		{/if}
		{#if field.description && field.markdown}
			<span class="text-xs text-muted-foreground">{@html field.description}</span>
		{:else if field.description}
			<span class="text-xs text-muted-foreground">{translateLabel(field.description)}</span>
		{/if}
	</label>
{:else}
	<input type="hidden" value={value ?? field.default ?? ''} />
{/if}
