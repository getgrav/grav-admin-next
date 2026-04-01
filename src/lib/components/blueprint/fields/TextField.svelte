<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { fieldSizeClass } from '$lib/utils/field-size';

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
	<div class="space-y-2">
		{#if field.label || field.help}
			<div>
				{#if field.label}
					<label class="text-sm font-semibold text-foreground">
						{translateLabel(field.label)}
						{#if field.validate?.required}
							<span class="text-red-500">*</span>
						{/if}
					</label>
				{/if}
				{#if field.help}
					<p class="mt-0.5 text-xs text-muted-foreground">{translateLabel(field.help)}</p>
				{/if}
			</div>
		{/if}
		{#if field.prepend || field.append}
			<div class="flex items-stretch rounded-lg shadow-sm">
				{#if field.prepend}
					<span class="flex items-center rounded-l-lg border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
						{translateLabel(field.prepend)}
					</span>
				{/if}
				<input
					type={inputType}
					class="flex h-10 min-w-0 flex-1 border border-input bg-muted/50 px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring {fieldSizeClass(field.size)}
						{field.prepend && field.append ? '' : field.prepend ? 'rounded-r-lg' : field.append ? 'rounded-l-lg' : 'rounded-lg'}"
					value={value ?? field.default ?? ''}
					placeholder={translateLabel(field.placeholder)}
					disabled={field.disabled}
					readonly={field.readonly}
					min={field.min}
					max={field.max}
					step={field.step}
					oninput={handleInput}
				/>
				{#if field.append}
					<span class="flex items-center rounded-r-lg border border-l-0 border-input bg-muted px-3 text-sm text-muted-foreground">
						{translateLabel(field.append)}
					</span>
				{/if}
			</div>
		{:else}
			<input
				type={inputType}
				class="flex h-10 w-full rounded-lg border border-input bg-muted/50 px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring {fieldSizeClass(field.size)}"
				value={value ?? field.default ?? ''}
				placeholder={translateLabel(field.placeholder)}
				disabled={field.disabled}
				readonly={field.readonly}
				min={field.min}
				max={field.max}
				step={field.step}
				oninput={handleInput}
			/>
		{/if}
		{#if field.description && field.markdown}
			<p class="text-xs text-muted-foreground">{@html field.description}</p>
		{:else if field.description}
			<p class="text-xs text-muted-foreground">{translateLabel(field.description)}</p>
		{/if}
	</div>
{:else}
	<input type="hidden" value={value ?? field.default ?? ''} />
{/if}
