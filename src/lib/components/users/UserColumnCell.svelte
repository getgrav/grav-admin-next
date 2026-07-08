<script lang="ts">
	import { Check, Minus } from 'lucide-svelte';
	import { formatColumnValue } from '$lib/utils/column-format';
	import type { ColumnFormatter } from '$lib/api/endpoints/users';

	interface Props {
		value: string | number | boolean | null | undefined;
		formatter: ColumnFormatter;
		label?: string | number | boolean | null | undefined;
	}

	let { value, formatter, label }: Props = $props();

	const cell = $derived(formatColumnValue(value, formatter, label));
</script>

{#if cell.kind === 'boolean'}
	{#if cell.value}
		<Check size={14} class="text-emerald-500" aria-label="yes" />
	{:else}
		<Minus size={14} class="text-muted-foreground" aria-label="no" />
	{/if}
{:else if cell.kind === 'link'}
	<a href={cell.href} target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">
		{cell.text}
	</a>
{:else if cell.kind === 'badge'}
	<span
		class="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[0.625rem] font-medium text-foreground"
	>
		{cell.text}
	</span>
{:else}
	<span class="text-muted-foreground">{cell.text}</span>
{/if}
