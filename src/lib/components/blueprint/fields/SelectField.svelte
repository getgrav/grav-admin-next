<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { ChevronsUpDown } from 'lucide-svelte';

	interface Props {
		field: BlueprintField;
		value: unknown;
		onchange: (value: unknown) => void;
	}

	let { field, value, onchange }: Props = $props();
	const translateLabel = i18n.tMaybe;

	// Normalize a value for option matching — booleans to '1'/'0'
	function normalize(v: unknown): string {
		if (v === true) return '1';
		if (v === false) return '0';
		if (v === undefined || v === null) return '';
		return String(v);
	}

	// Resolve the effective value: use config value, fall back to blueprint default
	const effectiveValue = $derived(
		value !== undefined && value !== null ? normalize(value) : normalize(field.default)
	);
</script>

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
	<div class="relative">
		<select
			class="flex h-10 w-full appearance-none rounded-lg border border-input bg-muted/50 pl-3 pr-8 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
			value={effectiveValue}
			onchange={(e) => onchange((e.target as HTMLSelectElement).value)}
			disabled={field.disabled}
		>
			{#if field.options}
				{#each field.options as opt (opt.value)}
					<option value={opt.value} selected={effectiveValue === opt.value}>{translateLabel(opt.label)}</option>
				{/each}
			{/if}
		</select>
		<div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5">
			<ChevronsUpDown size={14} class="text-muted-foreground" />
		</div>
	</div>
</div>
