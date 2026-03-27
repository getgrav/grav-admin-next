<script lang="ts">
	import { cn } from '$lib/utils';
	import type { Snippet } from 'svelte';
	let { children, class: className, ...rest }: { children?: Snippet; class?: string; [key: string]: unknown } = $props();
</script>
<div class={cn('p-4 pt-0', className)} {...rest}>
	{#if children}{@render children()}{/if}
</div>
