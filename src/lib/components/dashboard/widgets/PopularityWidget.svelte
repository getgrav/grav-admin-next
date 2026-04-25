<script lang="ts">
	import { TrendingUp } from 'lucide-svelte';
	import { getDashboardData } from '$lib/dashboard/context';
	import { formatNumber } from '$lib/dashboard/format';

	let { size = 'lg' } = $props();
	const data = getDashboardData();
	const popularity = $derived(data().popularity);
	const chartMax = $derived(popularity?.chart ? Math.max(...popularity.chart.map(p => p.views), 1) : 1);
</script>

<div class="flex h-full min-h-[300px] flex-col rounded-lg border border-border bg-card p-5">
	<div class="mb-4 flex items-center justify-between">
		<div>
			<h2 class="flex items-center gap-2 text-sm font-semibold text-foreground">
				<TrendingUp size={15} />
				Page Views
			</h2>
			<p class="mt-0.5 text-[11px] text-muted-foreground">Last 14 days</p>
		</div>
		{#if popularity}
			<div class="flex items-center gap-4">
				<div class="text-right">
					<div class="text-lg font-semibold tabular-nums text-foreground">{formatNumber(popularity.summary.today)}</div>
					<div class="text-[11px] text-muted-foreground">Today</div>
				</div>
				<div class="h-8 w-px bg-border"></div>
				<div class="text-right">
					<div class="text-lg font-semibold tabular-nums text-foreground">{formatNumber(popularity.summary.week)}</div>
					<div class="text-[11px] text-muted-foreground">This Week</div>
				</div>
				<div class="h-8 w-px bg-border"></div>
				<div class="text-right">
					<div class="text-lg font-semibold tabular-nums text-foreground">{formatNumber(popularity.summary.month)}</div>
					<div class="text-[11px] text-muted-foreground">This Month</div>
				</div>
			</div>
		{/if}
	</div>

	{#if popularity?.chart}
		{@const chartData = popularity.chart}
		{@const pts = chartData.map((p, i) => {
			const step = 650 / Math.max(chartData.length - 1, 1);
			return { x: 45 + i * step, y: 250 - (chartMax > 0 ? (p.views / chartMax) * 220 : 0) };
		})}
		{@const linePath = pts.map((p, i) => {
			if (i === 0) return `M ${p.x},${p.y}`;
			const prev = pts[i - 1];
			const cpx = (prev.x + p.x) / 2;
			return `C ${cpx},${prev.y} ${cpx},${p.y} ${p.x},${p.y}`;
		}).join(' ')}
		{@const areaPath = `${linePath} L ${pts[pts.length - 1].x},250 L ${pts[0].x},250 Z`}
		<div class="relative mt-2 flex-1">
			<svg viewBox="0 0 700 275" class="h-full w-full" preserveAspectRatio="none">
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
				<path d={areaPath} fill="url(#areaGradient-{size})" />
				<path d={linePath} fill="none" stroke="var(--primary)" stroke-width="2" />
				{#each pts as p, i}
					<circle cx={p.x} cy={p.y} r="3" fill="var(--primary)">
						<title>{chartData[i].date}: {chartData[i].views} views</title>
					</circle>
				{/each}
			</svg>
		</div>
	{/if}
</div>
