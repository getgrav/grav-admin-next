<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { prefs } from '$lib/stores/preferences.svelte';
	import { TrendingUp, ArrowUpRight, ArrowDownRight } from 'lucide-svelte';
	import { tweened } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { getDashboardData } from '$lib/dashboard/context';
	import { formatNumber } from '$lib/dashboard/format';
	import SegmentedToggle from '$lib/components/ui/SegmentedToggle.svelte';
	import { getPopularity, POPULARITY_RANGES, type PopularityData, type PopularityRangeKey } from '$lib/api/endpoints/dashboard';

	let { size = 'lg' } = $props();
	const data = getDashboardData();
	const animated = $derived(data().animated);

	// The dashboard loads the default 14 days with everything else; any other
	// time frame is fetched here. API versions before 1.1.11 have no `range`
	// and always send 14 days, so the picker only shows when it's supported.
	const base = $derived(data().popularity);
	const supportsRange = $derived(!!base?.range);
	const range = $derived<PopularityRangeKey>(supportsRange ? prefs.popularityRange : '14d');

	let fetched = $state<{ key: PopularityRangeKey; data: PopularityData } | null>(null);
	let loading = $state(false);
	let failed = $state(false);
	let requested: PopularityRangeKey | null = null;

	$effect(() => {
		const key = range;
		if (!base || (base.range?.key ?? '14d') === key || requested === key) return;
		requested = key;
		loading = true;
		failed = false;
		getPopularity(key)
			.then((d) => { if (requested === key) fetched = { key, data: d }; })
			// Forget a failed request so picking the range again retries it.
			.catch(() => { if (requested === key) { failed = true; requested = null; } })
			.finally(() => { if (requested === key) loading = false; });
	});

	// Before the new range arrives the old chart stays up, dimmed.
	const popularity = $derived(
		base && (base.range?.key ?? '14d') === range ? base : (fetched?.data ?? base),
	);

	const RANGE_LABELS: Record<PopularityRangeKey, string> = {
		'7d': 'LAST_7_DAYS',
		'14d': 'LAST_14_DAYS',
		'30d': 'LAST_30_DAYS',
		'90d': 'LAST_90_DAYS',
		'12m': 'LAST_12_MONTHS',
	};
	const rangeLabel = (key: PopularityRangeKey) => i18n.t(`ADMIN_NEXT.POPULARITY_WIDGET.${RANGE_LABELS[key]}`);
	const shownRange = $derived<PopularityRangeKey>(popularity?.range?.key ?? '14d');
	const stale = $derived(shownRange !== range);
	const rangeOptions = $derived(
		POPULARITY_RANGES.map((key) => ({ value: key, label: i18n.t(`ADMIN_NEXT.POPULARITY_WIDGET.SHORT_${key.toUpperCase()}`) })),
	);

	const total = $derived(popularity?.range?.total ?? popularity?.chart.reduce((sum, p) => sum + p.views, 0) ?? 0);
	const previous = $derived(popularity?.range?.previous ?? null);
	// No percentage against an empty earlier period: "+∞%" says nothing.
	const change = $derived(previous ? (total - previous) / previous : null);
	const percent = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 0, signDisplay: 'exceptZero' });

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

	/**
	 * Indexes that get an axis label: every point up to 7, otherwise up to 5
	 * at an even step counted back from the latest point, so the gaps match.
	 */
	function tickIndexes(count: number): number[] {
		if (count <= 7) return Array.from({ length: count }, (_, i) => i);
		const step = Math.ceil((count - 1) / 4);
		const ticks: number[] = [];
		for (let i = count - 1; i >= 0; i -= step) ticks.unshift(i);
		return ticks;
	}

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
	<div class="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
		<h2 class="flex items-center gap-2 text-sm font-semibold text-foreground">
			<TrendingUp size={15} />
			{i18n.t('ADMIN_NEXT.DASHBOARD.WIDGETS.POPULARITY')}
		</h2>
		{#if supportsRange}
			<SegmentedToggle
				size="sm"
				label={i18n.t('ADMIN_NEXT.POPULARITY_WIDGET.TIME_FRAME')}
				options={rangeOptions}
				value={range}
				onchange={(v) => (prefs.popularityRange = v)}
			/>
		{/if}
	</div>

	{#if popularity}
		<div class="flex flex-wrap items-end gap-x-6 gap-y-2" aria-live="polite">
			<div>
				<div class="flex items-center gap-2">
					<span class="text-2xl font-semibold tabular-nums text-foreground">{formatNumber(total)}</span>
					{#if change !== null && !stale}
						<span
							class="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[0.6875rem] font-medium tabular-nums
								{change > 0 ? 'bg-success/15 text-success' : change < 0 ? 'bg-destructive/15 text-destructive' : 'bg-muted text-muted-foreground'}"
							title={i18n.t('ADMIN_NEXT.POPULARITY_WIDGET.PREVIOUS_PERIOD', { count: previous ?? 0 })}
						>
							{#if change > 0}<ArrowUpRight size={12} />{:else if change < 0}<ArrowDownRight size={12} />{/if}
							{percent.format(change)}
							<span class="sr-only">{i18n.t('ADMIN_NEXT.POPULARITY_WIDGET.VS_PREVIOUS')}</span>
						</span>
					{/if}
				</div>
				<div class="text-[0.6875rem] text-muted-foreground">
					{#if failed}
						{i18n.t('ADMIN_NEXT.POPULARITY_WIDGET.LOAD_FAILED')}
					{:else}
						{rangeLabel(shownRange)}
					{/if}
				</div>
			</div>
			<div class="h-8 w-px bg-border"></div>
			<div>
				<div class="text-lg font-semibold tabular-nums text-foreground">{formatNumber(popularity.summary.today)}</div>
				<div class="text-[0.6875rem] text-muted-foreground">{i18n.t('ADMIN_NEXT.POPULARITY_WIDGET.TODAY')}</div>
			</div>
		</div>
	{/if}

	{#if popularity?.chart}
		{@const chartData = popularity.chart}
		{@const pts = chartData.map((p, i) => {
			const step = PLOT_W / Math.max(chartData.length - 1, 1);
			const targetY = 250 - (chartMax > 0 ? (p.views / chartMax) * 220 : 0);
			return { x: X0 + i * step, y: 250 + (targetY - 250) * $progress };
		})}
		{@const curve = (i: number) => {
			const prev = pts[i - 1];
			const p = pts[i];
			const cpx = (prev.x + p.x) / 2;
			return `C ${cpx},${prev.y} ${cpx},${p.y} ${p.x},${p.y}`;
		}}
		{@const linePath = pts.map((p, i) => (i === 0 ? `M ${p.x},${p.y}` : curve(i))).join(' ')}
		{@const last = pts.length - 1}
		{@const settledPath = pts.slice(0, last).map((p, i) => (i === 0 ? `M ${p.x},${p.y}` : curve(i))).join(' ')}
		{@const openPath = last > 0 ? `M ${pts[last - 1].x},${pts[last - 1].y} ${curve(last)}` : ''}
		{@const areaPath = `${linePath} L ${pts[pts.length - 1].x},250 L ${pts[0].x},250 Z`}
		{@const hit = active !== null && active < pts.length ? active : null}
		<!-- The whole plot is the hover target: the crosshair snaps to the nearest
		     day, so nobody has to land on a 3px dot. Arrow keys do the same. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
		<div
			class="relative mt-4 flex-1 cursor-crosshair touch-none rounded-md transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
				{stale || loading ? 'opacity-50' : ''}"
			role="group"
			tabindex="0"
			aria-label={i18n.t('ADMIN_NEXT.POPULARITY_WIDGET.CHART_RANGE_LABEL', { range: rangeLabel(shownRange) })}
			aria-busy={stale}
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
				<!-- The last point is today (or this month) and still filling up, so its
				     segment is dashed instead of reading as a sudden drop. -->
				{#if last > 0}
					<path d={settledPath} fill="none" stroke="var(--primary)" stroke-width="2" />
					<path d={openPath} fill="none" stroke="var(--primary)" stroke-width="2" stroke-dasharray="5 4" stroke-opacity="0.7" />
				{:else}
					<path d={linePath} fill="none" stroke="var(--primary)" stroke-width="2" />
				{/if}
				<!-- Past a month of points the dots crowd into a bead line; hover still marks the point. -->
				{#if pts.length <= 31}
					{#each pts as p}
						<circle cx={p.x} cy={p.y} r="3" fill="var(--primary)" />
					{/each}
				{/if}
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
					<div class="text-[0.6875rem] text-muted-foreground">
						{chartData[hit].date}{#if hit === last} · {i18n.t('ADMIN_NEXT.POPULARITY_WIDGET.SO_FAR')}{/if}
					</div>
				</div>
			{/if}

			<table class="sr-only">
				<caption>{i18n.t('ADMIN_NEXT.POPULARITY_WIDGET.CHART_RANGE_LABEL', { range: rangeLabel(shownRange) })}</caption>
				<tbody>
					{#each chartData as day}
						<tr><th scope="row">{day.date}</th><td>{i18n.t('ADMIN_NEXT.POPULARITY_WIDGET.VIEWS', { count: day.views })}</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
		<div class="relative mt-1.5 h-4 text-[0.625rem] tabular-nums text-muted-foreground" aria-hidden="true">
			{#each tickIndexes(chartData.length) as i, n (i)}
				<span
					class="absolute whitespace-nowrap"
					style="left: {(pts[i].x / VB_W) * 100}%; transform: translateX({n === tickIndexes(chartData.length).length - 1 ? '-100%' : '-50%'})"
				>{chartData[i].date}</span>
			{/each}
		</div>
	{/if}
</div>
