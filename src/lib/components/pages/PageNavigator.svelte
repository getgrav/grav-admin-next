<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { getChildren } from '$lib/api/endpoints/pages';
	import type { PageSummary } from '$lib/api/endpoints/pages';
	import { contentLang } from '$lib/stores/contentLang.svelte';
	import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-svelte';

	interface Props {
		route: string;
		hasChildren: boolean;
	}

	let { route, hasChildren }: Props = $props();

	let siblings = $state<PageSummary[]>([]);
	let loading = $state(true);

	const parentRoute = $derived(() => {
		const parts = route.split('/').filter(Boolean);
		if (parts.length <= 1) return '/';
		return '/' + parts.slice(0, -1).join('/');
	});

	const currentIndex = $derived(siblings.findIndex(s => s.route === route));
	const prevSibling = $derived(currentIndex > 0 ? siblings[currentIndex - 1] : null);
	const nextSibling = $derived(currentIndex >= 0 && currentIndex < siblings.length - 1 ? siblings[currentIndex + 1] : null);
	const canUp = $derived(parentRoute() !== '/');
	const canDown = $derived(hasChildren);
	const canLeft = $derived(prevSibling !== null);
	const canRight = $derived(nextSibling !== null);

	// Load siblings on mount / route change
	$effect(() => {
		const parent = parentRoute();
		loading = true;
		getChildren(parent, 'default', 'asc', contentLang.activeLang || undefined)
			.then(pages => {
				siblings = pages;
				loading = false;
			})
			.catch(() => {
				siblings = [];
				loading = false;
			});
	});

	function navigate(target: string) {
		goto(`${base}/pages/edit${target}`);
	}

	async function goDown() {
		if (!hasChildren) return;
		try {
			const children = await getChildren(route, 'default', 'asc', contentLang.activeLang || undefined);
			if (children.length > 0) {
				navigate(children[0].route);
			}
		} catch { /* ignore */ }
	}

	// Dragging state — persist position across sessions
	const POS_KEY = 'grav_admin_navigator_pos';
	let dragging = $state(false);
	let pos = $state(loadPos());
	let dragStart = { x: 0, y: 0, px: 0, py: 0 };

	function loadPos(): { x: number; y: number } {
		try {
			const raw = localStorage.getItem(POS_KEY);
			return raw ? JSON.parse(raw) : { x: 0, y: 0 };
		} catch { return { x: 0, y: 0 }; }
	}

	function savePos() {
		localStorage.setItem(POS_KEY, JSON.stringify(pos));
	}

	function onPointerDown(e: PointerEvent) {
		if ((e.target as HTMLElement).closest('button')) return;
		dragging = true;
		dragStart = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragging) return;
		pos = {
			x: dragStart.px + (e.clientX - dragStart.x),
			y: dragStart.py + (e.clientY - dragStart.y),
		};
	}

	function onPointerUp() {
		dragging = false;
		savePos();
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="fixed z-50 select-none"
	style="bottom: {80 - pos.y}px; right: {80 - pos.x}px;"
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
>
	<div class="relative h-[140px] w-[140px] rounded-full border-2 border-primary/40 bg-card shadow-xl ring-1 ring-primary/10
		{dragging ? 'cursor-grabbing' : 'cursor-grab'}">

		<!-- Up (parent) -->
		<button
			class="absolute left-1/2 top-0.5 -translate-x-1/2 flex h-10 w-10 items-center justify-center rounded-full transition-colors
				{canUp ? 'text-foreground hover:bg-accent hover:text-primary' : 'text-muted-foreground/30 cursor-not-allowed'}"
			disabled={!canUp}
			onclick={() => navigate(parentRoute())}
			title={canUp ? `Parent: ${parentRoute()}` : 'No parent'}
		>
			<ChevronUp size={22} strokeWidth={2.5} />
		</button>

		<!-- Down (first child) -->
		<button
			class="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex h-10 w-10 items-center justify-center rounded-full transition-colors
				{canDown ? 'text-foreground hover:bg-accent hover:text-primary' : 'text-muted-foreground/30 cursor-not-allowed'}"
			disabled={!canDown}
			onclick={goDown}
			title={canDown ? 'First child' : 'No children'}
		>
			<ChevronDown size={22} strokeWidth={2.5} />
		</button>

		<!-- Left (previous sibling) -->
		<button
			class="absolute left-0.5 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full transition-colors
				{canLeft ? 'text-foreground hover:bg-accent hover:text-primary' : 'text-muted-foreground/30 cursor-not-allowed'}"
			disabled={!canLeft}
			onclick={() => prevSibling && navigate(prevSibling.route)}
			title={canLeft ? `Previous: ${prevSibling?.menu || prevSibling?.title}` : 'No previous sibling'}
		>
			<ChevronLeft size={22} strokeWidth={2.5} />
		</button>

		<!-- Right (next sibling) -->
		<button
			class="absolute right-0.5 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full transition-colors
				{canRight ? 'text-foreground hover:bg-accent hover:text-primary' : 'text-muted-foreground/30 cursor-not-allowed'}"
			disabled={!canRight}
			onclick={() => nextSibling && navigate(nextSibling.route)}
			title={canRight ? `Next: ${nextSibling?.menu || nextSibling?.title}` : 'No next sibling'}
		>
			<ChevronRight size={22} strokeWidth={2.5} />
		</button>

		<!-- Center cross lines -->
		<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
			<div class="h-[1px] w-8 bg-border/50"></div>
		</div>
		<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
			<div class="h-8 w-[1px] bg-border/50"></div>
		</div>
	</div>
</div>
