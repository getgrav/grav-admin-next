<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet<[{ scrolled: boolean }]>;
		height?: number;
		class?: string;
	}
	let { children, height = $bindable(0), class: className = '' }: Props = $props();

	let scrolled = $state(false);
	let sentinel: HTMLElement;
	let headerEl: HTMLElement;

	$effect(() => {
		if (!sentinel) return;
		const observer = new IntersectionObserver(
			([entry]) => { scrolled = !entry.isIntersecting; },
			{ threshold: 0, rootMargin: '-1px 0px 0px 0px' }
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	});

	$effect(() => {
		if (!headerEl) return;
		const observer = new ResizeObserver(([entry]) => {
			height = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
		});
		observer.observe(headerEl);
		return () => observer.disconnect();
	});
</script>

<div bind:this={sentinel} class="h-0 w-full shrink-0" aria-hidden="true"></div>
<div
	bind:this={headerEl}
	class="sticky top-0 z-10 bg-background transition-[border-color,box-shadow] duration-200
		{scrolled ? 'border-b border-border shadow-sm' : 'border-b border-transparent'}
		{className}"
>
	{@render children({ scrolled })}
</div>
