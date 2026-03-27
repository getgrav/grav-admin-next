<script lang="ts">
	import { cn } from '$lib/utils';
	import type { Snippet } from 'svelte';
	let { children, class: className, ...rest }: { children?: Snippet; class?: string; [key: string]: unknown } = $props();
</script>
<p class={cn('text-xs text-muted-foreground', className)} {...rest}>
	{#if children}{@render children()}{/if}
</p>
