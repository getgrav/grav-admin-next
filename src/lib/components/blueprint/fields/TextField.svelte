<script lang="ts">
	import { renderMarkdownInline } from '$lib/utils/markdown';
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { fieldSizeClass } from '$lib/utils/field-size';
	import { numericConstraint, lengthConstraint } from '$lib/utils/field-constraints';

	interface Props {
		field: BlueprintField;
		value: unknown;
		onchange: (value: unknown) => void;
		error?: string;
	}

	let { field, value, onchange, error }: Props = $props();
	const translateLabel = i18n.tMaybe;

	const inputType = field.type === 'number' ? 'number' : field.type === 'color' ? 'color' : field.type === 'range' ? 'range' : field.type === 'password' ? 'password' : field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : field.type === 'date' ? 'date' : field.type === 'datetime' ? 'datetime-local' : field.type === 'time' ? 'time' : 'text';

	// Grav writes a constraint either as a top-level field prop or nested under
	// `validate:`, and `validate:` is the form it validates against on save.
	// Numeric bounds apply to number/range; on text-like inputs validate.min/max
	// are character counts and map to minlength/maxlength; date-like inputs take
	// min/max as date strings, so those pass through raw. (admin2#155)
	const isNumeric = $derived(field.type === 'number' || field.type === 'range');
	const isDateLike = $derived(['date', 'datetime', 'time', 'month', 'week'].includes(field.type));
	const minAttr = $derived(
		isNumeric ? numericConstraint(field, 'min') : isDateLike ? (field.min ?? field.validate?.min) : undefined
	);
	const maxAttr = $derived(
		isNumeric ? numericConstraint(field, 'max') : isDateLike ? (field.max ?? field.validate?.max) : undefined
	);
	const stepAttr = $derived(isNumeric || isDateLike ? numericConstraint(field, 'step') : undefined);
	const minLengthAttr = $derived(isNumeric || isDateLike ? undefined : lengthConstraint(field, 'minlength'));
	const maxLengthAttr = $derived(isNumeric || isDateLike ? undefined : lengthConstraint(field, 'maxlength'));

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
					<p class="mt-0.5 text-xs text-muted-foreground">{@html translateLabel(field.help)}</p>
				{/if}
			</div>
		{/if}
		{#if field.prepend || field.append}
			<div class="flex items-stretch rounded-lg">
				{#if field.prepend}
					<span class="flex items-center rounded-l-lg border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
						{translateLabel(field.prepend)}
					</span>
				{/if}
				<input
					type={inputType}
					class="flex h-10 min-w-0 flex-1 border bg-muted/50 px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring {fieldSizeClass(field.size)}
						{error ? 'border-destructive ring-1 ring-destructive' : 'border-input'}
						{field.prepend && field.append ? '' : field.prepend ? 'rounded-r-lg' : field.append ? 'rounded-l-lg' : 'rounded-lg'}"
					value={value ?? field.default ?? ''}
					placeholder={translateLabel(field.placeholder)}
					disabled={field.disabled}
					readonly={field.readonly}
					min={minAttr}
					max={maxAttr}
					step={stepAttr}
					minlength={minLengthAttr}
					maxlength={maxLengthAttr}
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
				class="flex h-10 w-full rounded-lg border bg-muted/50 px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring {fieldSizeClass(field.size)} {error ? 'border-destructive ring-1 ring-destructive' : 'border-input'}"
				value={value ?? field.default ?? ''}
				placeholder={translateLabel(field.placeholder)}
				disabled={field.disabled}
				readonly={field.readonly}
				min={minAttr}
				max={maxAttr}
				step={stepAttr}
				minlength={minLengthAttr}
				maxlength={maxLengthAttr}
				oninput={handleInput}
			/>
		{/if}
		{#if field.description}
			{@const desc = translateLabel(field.description)}
			{#if field.markdown}
				<p class="text-xs text-muted-foreground">{@html renderMarkdownInline(desc)}</p>
			{:else}
				<p class="text-xs text-muted-foreground">{desc}</p>
			{/if}
		{/if}
		{#if error}
			<p class="text-xs font-medium text-destructive" data-field-error>{error}</p>
		{/if}
	</div>
{:else}
	<input type="hidden" value={value ?? field.default ?? ''} />
{/if}
