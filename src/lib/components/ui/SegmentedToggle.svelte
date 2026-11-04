<script lang="ts" generics="T extends string | number | boolean">
	interface Option {
		value: T;
		label: string;
	}

	interface Props {
		options: Option[];
		value: T;
		onchange: (v: T) => void;
		disabled?: boolean;
		/** `sm` fits a card header. */
		size?: 'sm' | 'md';
		/** Accessible name for the group. */
		label?: string;
	}

	let { options, value, onchange, disabled = false, size = 'md', label }: Props = $props();

	const count = $derived(options.length);
	const activeIndex = $derived(Math.max(0, options.findIndex((o) => o.value === value)));
</script>

<div
	role="group"
	aria-label={label}
	class="relative isolate inline-grid rounded-lg border border-input bg-muted/30 p-0.5"
	style="grid-template-columns: repeat({count}, minmax(0, 1fr));"
>
	<div
		class="absolute top-0.5 bottom-0.5 rounded-md bg-primary shadow-sm transition-all duration-200 ease-out"
		style="inset-inline-start: calc({activeIndex} * (100% / {count}) + 2px); width: calc(100% / {count} - 4px);"
	></div>

	{#each options as opt, i (i)}
		<button
			type="button"
			class="relative z-10 rounded-md font-medium transition-colors duration-200
				{size === 'sm' ? 'px-2.5 py-1 text-xs tabular-nums' : 'px-4 py-2 text-sm'}
				{opt.value === value ? 'text-white' : 'text-muted-foreground hover:text-foreground'}"
			aria-pressed={opt.value === value}
			{disabled}
			onclick={() => onchange(opt.value)}
		>
			{opt.label}
		</button>
	{/each}
</div>
