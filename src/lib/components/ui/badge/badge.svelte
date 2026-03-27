<script lang="ts">
	import { cn } from '$lib/utils';
	import type { Snippet } from 'svelte';

	type Variant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success';

	interface Props {
		variant?: Variant;
		children?: Snippet;
		class?: string;
	}
	let { variant = 'default', children, class: className }: Props = $props();

	const variants: Record<Variant, string> = {
		default: 'bg-primary-600/10 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300',
		secondary: 'bg-secondary text-secondary-foreground',
		destructive: 'bg-red-600/10 text-red-700 dark:bg-red-500/15 dark:text-red-300',
		outline: 'border border-border text-foreground',
		success: 'bg-emerald-600/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
	};
</script>

<span class={cn('inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors', variants[variant], className)}>
	{#if children}{@render children()}{/if}
</span>
