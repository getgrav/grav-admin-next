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

	const options = $derived(
		field.options?.length
			? field.options.map((opt) => ({
					value: opt.value,
					label: translateLabel(opt.label)
				}))
			: isBool
				? [
						{ value: '1', label: 'Yes' },
						{ value: '0', label: 'No' }
					]
				: [
						{ value: String(field.highlight ?? 1), label: 'Yes' },
						{ value: '0', label: 'No' }
					]
	);

	const highlightStr = $derived(
		field.highlight !== undefined && field.highlight !== null
			? String(field.highlight)
			: undefined
	);

	function normalizeValue(v: unknown): string {
		if (v === true) return '1';
		if (v === false) return '0';
		if (v === null || v === undefined) return '';
		return String(v);
	}

	const currentStr = $derived(
		value !== undefined && value !== null
			? normalizeValue(value)
			: field.default !== undefined && field.default !== null
				? normalizeValue(field.default)
				: ''
	);

	// Always resolve to a valid index — if currentStr doesn't match, use highlight or first option
	const matchIndex = $derived(options.findIndex((o) => o.value === currentStr));
	const highlightIndex = $derived(highlightStr !== undefined ? options.findIndex((o) => o.value === highlightStr) : -1);
	const activeIndex = $derived(matchIndex >= 0 ? matchIndex : highlightIndex >= 0 ? highlightIndex : 0);

	const count = $derived(options.length);

	function select(optValue: string) {
		if (isBool) {
			onchange(optValue === '1' || optValue === 'true');
		} else {
			const num = Number(optValue);
			onchange(isNaN(num) || optValue === '' ? optValue : num);
		}
	}

	function isHighlighted(optValue: string): boolean {
		if (highlightStr === undefined) return true;
		return optValue === highlightStr;
	}

	const activeIsHighlighted = $derived(isHighlighted(options[activeIndex]?.value ?? ''));
	const activeValue = $derived(options[activeIndex]?.value ?? '');
</script>

<div class="space-y-2">
	{#if field.label || field.help || field.description}
		<div>
			{#if field.label}
				<span class="text-sm font-semibold text-foreground">
					{translateLabel(field.label)}
				</span>
			{/if}
			{#if field.help}
				<p class="mt-0.5 text-xs text-muted-foreground">{translateLabel(field.help)}</p>
			{/if}
			{#if field.description}
				<p class="mt-0.5 text-xs text-muted-foreground">{translateLabel(field.description)}</p>
			{/if}
		</div>
	{/if}

	<!-- Segmented toggle with CSS-based sliding indicator -->
	<div class="relative inline-grid rounded-lg border border-input bg-muted/30 p-0.5"
		style="grid-template-columns: repeat({count}, minmax(0, 1fr));"
	>
		<!-- Sliding highlight (CSS positioned by grid fraction) -->
		<div
			class="absolute top-0.5 bottom-0.5 rounded-md shadow-sm transition-all duration-200 ease-out
				{activeIsHighlighted ? 'bg-primary' : 'bg-muted-foreground/70'}"
			style="left: calc({activeIndex} * (100% / {count}) + 2px); width: calc(100% / {count} - 4px);"
		></div>

		{#each options as opt, i (opt.value)}
			<button
				type="button"
				class="relative z-10 rounded-md px-4 py-2 text-sm font-medium transition-colors duration-200
					{opt.value === activeValue
						? 'text-white'
						: 'text-muted-foreground hover:text-foreground'}"
				disabled={field.disabled}
				onclick={() => select(opt.value)}
			>
				{opt.label}
			</button>
		{/each}
	</div>
</div>
