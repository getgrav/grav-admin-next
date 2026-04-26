<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet<[{ scrolled: boolean }]>;
		height?: number;
		class?: string;
		/** Suppress the border/shadow that appears when scrolled */
		noBorder?: boolean;
	}
	let { children, height = $bindable(0), class: className = '', noBorder = false }: Props = $props();

	let scrolled = $state(false);
	let sentinel = $state<HTMLElement | undefined>();
	let headerEl = $state<HTMLElement | undefined>();
	let sentinelVisible = true;

	// Method 1: IntersectionObserver — for document-level scrolling pages
	$effect(() => {
		if (!sentinel) return;
		const observer = new IntersectionObserver(
			([entry]) => {
				sentinelVisible = entry.isIntersecting;
				scrolled = !entry.isIntersecting;
			},
			{ threshold: 0, rootMargin: '-1px 0px 0px 0px' }
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	});

	// Method 2: capture-phase scroll — for flex/overflow layout pages
	// where the sentinel stays visible and scrolling happens in a child container.
	$effect(() => {
		if (!headerEl) return;
		const parent = headerEl.parentElement;
		if (!parent) return;

		function onScroll(e: Event) {
			if (!sentinelVisible) return; // document-scroll pages use method 1
			const target = e.target as HTMLElement;
			if (target === document || target === document.documentElement) return;
			scrolled = target.scrollTop > 0;
		}

		parent.addEventListener('scroll', onScroll, true);
		return () => parent.removeEventListener('scroll', onScroll, true);
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
		{scrolled && !noBorder ? 'border-b border-border shadow-sm' : 'border-b border-transparent'}
		{className}"
>
	{@render children({ scrolled })}
</div>
