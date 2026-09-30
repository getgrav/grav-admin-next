<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { TrendingUp } from 'lucide-svelte';
	import { tweened } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { getDashboardData } from '$lib/dashboard/context';
	import { formatNumber } from '$lib/dashboard/format';

	let { size = 'lg' } = $props();
	const data = getDashboardData();
	const popularity = $derived(data().popularity);
	const animated = $derived(data().animated);
	const chartMax = $derived(popularity?.chart ? Math.max(...popularity.chart.map(p => p.views), 1) : 1);

	const progress = tweened(0, { duration: 900, easing: cubicOut });
	$effect(() => { progress.set(animated ? 1 : 0); });

	// Chart geometry in viewBox units. The SVG stretches to the card
	// (preserveAspectRatio="none"), so HTML overlays are placed by percentage
	// of these extents, in physical left/top to match the SVG's own axes.
	const VB_W = 700;
	const VB_H = 275;
	const X0 = 45;
	const PLOT_W = 650;

	// Index of the day under the pointer (or keyboard focus), null when idle.
	let active = $state<number | null>(null);

	function nearestIndex(e: PointerEvent, count: number): number {
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const vx = ((e.clientX - rect.left) / rect.width) * VB_W;
		const step = PLOT_W / Math.max(count - 1, 1);
		return Math.min(count - 1, Math.max(0, Math.round((vx - X0) / step)));
	}

	function onKeydown(e: KeyboardEvent, count: number) {
		if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
			e.preventDefault();
			const delta = e.key === 'ArrowRight' ? 1 : -1;
			active = Math.min(count - 1, Math.max(0, (active ?? count - 1) + delta));
		} else if (e.key === 'Home' || e.key === 'End') {
			e.preventDefault();
			active = e.key === 'Home' ? 0 : count - 1;
		} else if (e.key === 'Escape') {
			active = null;
		}
	}
</script>

<div class="flex h-full min-h-[300px] flex-col rounded-lg border border-border bg-card p-5">
	<div class="mb-4 flex items-center justify-between">
		<div>
			<h2 class="flex items-center gap-2 text-sm font-semibold text-foreground">
				<TrendingUp size={15} />
				{i18n.t('ADMIN_NEXT.DASHBOARD.WIDGETS.POPULARITY')}
			</h2>
			<p class="mt-0.5 text-[0.6875rem] text-muted-foreground">{i18n.t('ADMIN_NEXT.POPULARITY_WIDGET.LAST_14_DAYS')}</p>
		</div>
		{#if popularity}
			<div class="flex items-center gap-4">
				<div class="text-end">
					<div class="text-lg font-semibold tabular-nums text-foreground">{formatNumber(popularity.summary.today)}</div>
					<div class="text-[0.6875rem] text-muted-foreground">{i18n.t('ADMIN_NEXT.POPULARITY_WIDGET.TODAY')}</div>
				</div>
				<div class="h-8 w-px bg-border"></div>
				<div class="text-end">
					<div class="text-lg font-semibold tabular-nums text-foreground">{formatNumber(popularity.summary.week)}</div>
					<div class="text-[0.6875rem] text-muted-foreground">{i18n.t('ADMIN_NEXT.POPULARITY_WIDGET.THIS_WEEK')}</div>
				</div>
				<div class="h-8 w-px bg-border"></div>
				<div class="text-end">
					<div class="text-lg font-semibold tabular-nums text-foreground">{formatNumber(popularity.summary.month)}</div>
					<div class="text-[0.6875rem] text-muted-foreground">{i18n.t('ADMIN_NEXT.POPULARITY_WIDGET.THIS_MONTH')}</div>
				</div>
			</div>
		{/if}
	</div>

	{#if popularity?.chart}
		{@const chartData = popularity.chart}
		{@const pts = chartData.map((p, i) => {
			const step = PLOT_W / Math.max(chartData.length - 1, 1);
			const targetY = 250 - (chartMax > 0 ? (p.views / chartMax) * 220 : 0);
			return { x: X0 + i * step, y: 250 + (targetY - 250) * $progress };
		})}
		{@const linePath = pts.map((p, i) => {
			if (i === 0) return `M ${p.x},${p.y}`;
			const prev = pts[i - 1];
			const cpx = (prev.x + p.x) / 2;
			return `C ${cpx},${prev.y} ${cpx},${p.y} ${p.x},${p.y}`;
		}).join(' ')}
		{@const areaPath = `${linePath} L ${pts[pts.length - 1].x},250 L ${pts[0].x},250 Z`}
		{@const hit = active !== null && active < pts.length ? active : null}
		<!-- The whole plot is the hover target: the crosshair snaps to the nearest
		     day, so nobody has to land on a 3px dot. Arrow keys do the same. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
		<div
			class="relative mt-2 flex-1 cursor-crosshair touch-none rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			role="group"
			tabindex="0"
			aria-label={i18n.t('ADMIN_NEXT.POPULARITY_WIDGET.CHART_LABEL')}
			onpointermove={(e) => (active = nearestIndex(e, chartData.length))}
			onpointerdown={(e) => (active = nearestIndex(e, chartData.length))}
			onpointerleave={() => (active = null)}
			onfocus={() => (active ??= chartData.length - 1)}
			onblur={() => (active = null)}
			onkeydown={(e) => onKeydown(e, chartData.length)}
		>
			<svg viewBox="0 0 {VB_W} {VB_H}" class="h-full w-full" preserveAspectRatio="none" aria-hidden="true">
				<defs>
					<linearGradient id="areaGradient-{size}" x1="0" x2="0" y1="0" y2="1">
						<stop offset="0%" class="[stop-color:var(--primary)]" stop-opacity="0.3" />
						<stop offset="100%" class="[stop-color:var(--primary)]" stop-opacity="0.02" />
					</linearGradient>
				</defs>
				{#each [0, 0.25, 0.5, 0.75, 1] as tick}
					<line x1="40" y1={250 - tick * 220} x2="695" y2={250 - tick * 220}
						stroke="currentColor" stroke-opacity="0.08" stroke-dasharray="3 3" />
				{/each}
				{#if hit !== null}
					<line x1={pts[hit].x} y1="20" x2={pts[hit].x} y2="250"
						stroke="currentColor" stroke-opacity="0.3" vector-effect="non-scaling-stroke" />
				{/if}
				<path d={areaPath} fill="url(#areaGradient-{size})" />
				<path d={linePath} fill="none" stroke="var(--primary)" stroke-width="2" />
				{#each pts as p}
					<circle cx={p.x} cy={p.y} r="3" fill="var(--primary)" />
				{/each}
			</svg>

			{#if hit !== null}
				{@const left = (pts[hit].x / VB_W) * 100}
				{@const top = (pts[hit].y / VB_H) * 100}
				<!-- Drawn in HTML rather than SVG so the stretched viewBox doesn't turn it into an ellipse. -->
				<span
					class="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-card"
					style="left: {left}%; top: {top}%"
				></span>
				<!-- Readout sits beside the point, never over it: to its right on the
				     first half of the chart, to its left on the second, and clamped
				     vertically so a peak or a zero day keeps it inside the plot. -->
				<div
					class="pointer-events-none absolute z-10 whitespace-nowrap rounded-md border border-border bg-popover px-2.5 py-1.5 shadow-md"
					style="left: {left}%; top: clamp(0px, calc({top}% - 1.5rem), calc(100% - 3.25rem)); transform: translateX({left > 55 ? 'calc(-100% - 0.75rem)' : '0.75rem'})"
				>
					<div class="text-sm font-semibold tabular-nums text-popover-foreground">
						{i18n.t('ADMIN_NEXT.POPULARITY_WIDGET.VIEWS', { count: chartData[hit].views })}
					</div>
					<div class="text-[0.6875rem] text-muted-foreground">{chartData[hit].date}</div>
				</div>
			{/if}

			<table class="sr-only">
				<caption>{i18n.t('ADMIN_NEXT.POPULARITY_WIDGET.CHART_LABEL')}</caption>
				<tbody>
					{#each chartData as day}
						<tr><th scope="row">{day.date}</th><td>{i18n.t('ADMIN_NEXT.POPULARITY_WIDGET.VIEWS', { count: day.views })}</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
