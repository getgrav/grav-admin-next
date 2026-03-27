<script lang="ts">
	import { cn } from '$lib/utils';
	import type { Snippet } from 'svelte';
	let { children, class: className, ...rest }: { children?: Snippet; class?: string; [key: string]: unknown } = $props();
</script>
<h3 class={cn('text-sm font-semibold leading-none tracking-tight', className)} {...rest}>
	{#if children}{@render children()}{/if}
</h3>
