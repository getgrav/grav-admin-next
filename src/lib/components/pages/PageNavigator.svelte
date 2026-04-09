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
>
	<div class="nav-pad relative h-[110px] w-[110px] rounded-full border-2 border-primary/40 bg-card shadow-xl ring-1 ring-primary/10 overflow-hidden">

		<!-- Quadrant buttons — each covers a full quarter of the circle -->
		<!-- Up (parent) -->
		<button
			class="nav-quadrant nav-up {canUp ? '' : 'nav-disabled'}"
			disabled={!canUp}
			onclick={() => navigate(parentRoute())}
			title={canUp ? `Parent: ${parentRoute()}` : 'No parent'}
		>
			<ChevronUp size={18} strokeWidth={2.5} />
		</button>

		<!-- Down (first child) -->
		<button
			class="nav-quadrant nav-down {canDown ? '' : 'nav-disabled'}"
			disabled={!canDown}
			onclick={goDown}
			title={canDown ? 'First child' : 'No children'}
		>
			<ChevronDown size={18} strokeWidth={2.5} />
		</button>

		<!-- Left (previous sibling) -->
		<button
			class="nav-quadrant nav-left {canLeft ? '' : 'nav-disabled'}"
			disabled={!canLeft}
			onclick={() => prevSibling && navigate(prevSibling.route)}
			title={canLeft ? `Previous: ${prevSibling?.menu || prevSibling?.title}` : 'No previous sibling'}
		>
			<ChevronLeft size={18} strokeWidth={2.5} />
		</button>

		<!-- Right (next sibling) -->
		<button
			class="nav-quadrant nav-right {canRight ? '' : 'nav-disabled'}"
			disabled={!canRight}
			onclick={() => nextSibling && navigate(nextSibling.route)}
			title={canRight ? `Next: ${nextSibling?.menu || nextSibling?.title}` : 'No next sibling'}
		>
			<ChevronRight size={18} strokeWidth={2.5} />
		</button>

		<!-- Divider lines -->
		<div class="pointer-events-none absolute inset-0">
			<div class="absolute left-0 right-0 top-1/2 h-px bg-border/60"></div>
			<div class="absolute top-0 bottom-0 left-1/2 w-px bg-border/60"></div>
		</div>

		<!-- Center drag handle -->
		<div
			class="absolute left-1/2 top-1/2 z-10 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-card
				{dragging ? 'cursor-grabbing' : 'cursor-grab'}"
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
		>
			<div class="flex h-full w-full items-center justify-center">
				<div class="h-1 w-1 rounded-full bg-muted-foreground/50"></div>
			</div>
		</div>
	</div>
</div>

<style>
	.nav-quadrant {
		position: absolute;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		border: none;
		background: transparent;
		color: var(--foreground);
		cursor: pointer;
		transition: background 0.15s;
		padding: 0;
	}
	.nav-quadrant:not(:disabled):hover {
		background: color-mix(in srgb, var(--accent, #f4f4f5) 80%, transparent);
	}
	.nav-quadrant:not(:disabled):active {
		background: color-mix(in srgb, var(--primary, #3b82f6) 15%, transparent);
	}
	.nav-disabled {
		color: color-mix(in srgb, var(--muted-foreground, #71717a) 25%, transparent);
		cursor: not-allowed;
	}

	/* Clip each quadrant to its quarter of the circle, excluding center 28px circle */
	.nav-up {
		clip-path: polygon(0 0, 100% 0, 50% 50%);
		padding-bottom: 30%;
	}
	.nav-down {
		clip-path: polygon(0 100%, 100% 100%, 50% 50%);
		padding-top: 30%;
	}
	.nav-left {
		clip-path: polygon(0 0, 0 100%, 50% 50%);
		padding-right: 30%;
	}
	.nav-right {
		clip-path: polygon(100% 0, 100% 100%, 50% 50%);
		padding-left: 30%;
	}
</style>
