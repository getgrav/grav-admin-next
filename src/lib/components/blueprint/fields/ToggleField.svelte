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

	// Normalize the highlight value to string for comparison
	const highlightStr = $derived(
		field.highlight !== undefined && field.highlight !== null
			? String(field.highlight)
			: undefined
	);

	/**
	 * Normalize a value to match against option keys.
	 * Handles: true->'1', false->'0', numbers, strings
	 */
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

	const activeIndex = $derived(
		Math.max(0, options.findIndex((o) => o.value === currentStr))
	);

	function select(optValue: string) {
		if (isBool) {
			onchange(optValue === '1' || optValue === 'true');
		} else {
			const num = Number(optValue);
			onchange(isNaN(num) || optValue === '' ? optValue : num);
		}
	}

	/**
	 * Determine the color for the active option:
	 * - If it matches the highlight value -> primary (blue, recommended)
	 * - Otherwise -> neutral gray (valid but not preferred)
	 */
	function isHighlighted(optValue: string): boolean {
		if (highlightStr === undefined) return true; // no highlight defined, always primary
		return optValue === highlightStr;
	}

	// Track button refs for measuring indicator position
	let containerEl = $state<HTMLDivElement | null>(null);
	let buttonEls = $state<HTMLButtonElement[]>([]);
	let indicatorStyle = $state('');

	function updateIndicator() {
		if (!containerEl || !buttonEls[activeIndex]) return;
		const btn = buttonEls[activeIndex];
		const containerRect = containerEl.getBoundingClientRect();
		const btnRect = btn.getBoundingClientRect();
		const left = btnRect.left - containerRect.left;
		const width = btnRect.width;
		indicatorStyle = `left:${left}px;width:${width}px`;
	}

	$effect(() => {
		activeIndex;
		requestAnimationFrame(updateIndicator);
	});

	const activeIsHighlighted = $derived(isHighlighted(options[activeIndex]?.value ?? ''));
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

	<!-- Segmented toggle with sliding indicator -->
	<div
		bind:this={containerEl}
		class="relative inline-flex items-stretch rounded-lg border border-input bg-muted/30 p-0.5"
	>
		<!-- Sliding highlight -->
		{#if indicatorStyle}
			<div
				class="absolute top-0.5 bottom-0.5 rounded-md shadow-sm transition-all duration-200 ease-out
					{activeIsHighlighted ? 'bg-primary' : 'bg-muted-foreground/70'}"
				style={indicatorStyle}
			></div>
		{/if}

		{#each options as opt, i (opt.value)}
			<button
				bind:this={buttonEls[i]}
				type="button"
				class="relative z-10 rounded-md px-3 py-1 text-xs font-medium transition-colors duration-200
					{currentStr === opt.value
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
