<script lang="ts">
	import { base } from '$app/paths';
	import { auth } from '$lib/stores/auth.svelte';
	import {
		getStats, getNotifications, getPopularity, getFeed, getBackups, getUpdates, getSystemInfoOverview,
		type DashboardStats, type Notification, type PopularityData,
		type FeedItem, type BackupInfo, type UpdatesData, type SystemInfoOverview
	} from '$lib/api/endpoints/dashboard';
	import { updateAllPackages, upgradeGrav } from '$lib/api/endpoints/gpm';
	import { canWrite } from '$lib/utils/permissions';
	import { dialogs } from '$lib/stores/dialogs.svelte';
	import { getSystemInfo } from '$lib/api/endpoints/system';
	import { getRecentPages } from '$lib/api/endpoints/pages';
	import type { SystemInfo } from '$lib/api/endpoints/system';
	import type { PageSummary } from '$lib/api/endpoints/pages';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { toast } from 'svelte-sonner';
	import { usePoll } from '$lib/utils/poll.svelte';
	import { invalidations } from '$lib/stores/invalidation.svelte';
	import { onMount } from 'svelte';
	import {
		FileText, Users, Puzzle, Palette, RefreshCw, Clock,
		ExternalLink, ArrowUpRight, ArrowDownRight, Minus, Download,
		TrendingUp, Eye, HardDrive, Shield, Rss, Archive,
		CheckCircle2, AlertTriangle, Loader2, Server, Activity, ArrowUpCircle,
		ArrowRight
	} from 'lucide-svelte';
	import StickyHeader from '$lib/components/ui/StickyHeader.svelte';

	let stats = $state<DashboardStats | null>(null);
	let systemInfo = $state<SystemInfo | null>(null);
	let notifications = $state<Notification[]>([]);
	let recentPages = $state<PageSummary[]>([]);
	let popularity = $state<PopularityData | null>(null);
	let feed = $state<FeedItem[]>([]);
	let backups = $state<BackupInfo[]>([]);
	let updates = $state<UpdatesData | null>(null);
	let reports = $state<SystemInfoOverview | null>(null);
	let loading = $state(true);
	let animated = $state(false);
	let updatingAll = $state(false);
	let upgradingGrav = $state(false);

	const canWriteGpm = $derived(canWrite('gpm'));

	// Animated counter — tweens from 0 to target over duration
	function useTween(target: () => number, duration = 700) {
		let display = $state(0);
		$effect(() => {
			const end = target();
			if (!animated || end === 0) { display = 0; return; }
			const start = 0;
			const startTime = performance.now();
			function tick(now: number) {
				const elapsed = now - startTime;
				const t = Math.min(elapsed / duration, 1);
				const ease = 1 - Math.pow(1 - t, 3); // easeOutCubic
				display = Math.round(start + (end - start) * ease);
				if (t < 1) requestAnimationFrame(tick);
			}
			requestAnimationFrame(tick);
		});
		return { get value() { return display; } };
	}

	const tweenPages = useTween(() => stats?.pages.total ?? 0);
	const tweenUsers = useTween(() => stats?.users.total ?? 0);
	const tweenPlugins = useTween(() => stats?.plugins.total ?? 0);

	async function loadDashboard() {
		loading = true;
		try {
			const results = await Promise.allSettled([
				getStats(),
				getSystemInfo(),
				getNotifications(),
				getRecentPages(8),
				getPopularity(),
				getFeed(),
				getBackups(),
				getUpdates(),
				getSystemInfoOverview(),
			]);
			if (results[0].status === 'fulfilled') stats = results[0].value;
			if (results[1].status === 'fulfilled') systemInfo = results[1].value;
			if (results[2].status === 'fulfilled') notifications = results[2].value;
			if (results[3].status === 'fulfilled') recentPages = results[3].value;
			if (results[4].status === 'fulfilled') popularity = results[4].value;
			if (results[5].status === 'fulfilled') feed = (results[5].value as any)?.feed ?? [];
			if (results[6].status === 'fulfilled') backups = results[6].value;
			if (results[7].status === 'fulfilled') updates = results[7].value;
			if (results[8].status === 'fulfilled') reports = results[8].value;
		} catch {
			// Individual failures handled above
		} finally {
			loading = false;
			animated = false;
			requestAnimationFrame(() => requestAnimationFrame(() => { animated = true; }));
		}
	}

	function formatDate(dateStr: string): string {
		const date = new Date(dateStr);
		const now = new Date();
		const diff = now.getTime() - date.getTime();
		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);
		if (minutes < 1) return 'just now';
		if (minutes < 60) return `${minutes}m ago`;
		if (hours < 24) return `${hours}h ago`;
		if (days < 7) return `${days}d ago`;
		return date.toLocaleDateString();
	}

	function formatBytes(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
		if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
		return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
	}

	function formatNumber(n: number): string {
		if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
		return String(n);
	}

	// Chart helpers
	const chartMax = $derived(
		popularity?.chart ? Math.max(...popularity.chart.map(p => p.views), 1) : 1
	);

	const diskUsedPercent = $derived(
		reports?.disk
			? Math.round(((reports.disk.total_space - reports.disk.free_space) / reports.disk.total_space) * 100)
			: 0
	);

	const totalUpdates = $derived(updates?.total ?? 0);
	const hasPackageUpdates = $derived(
		(updates?.plugins?.some((p) => p.updatable) ?? false) ||
		(updates?.themes?.some((t) => t.updatable) ?? false),
	);

	async function handleUpdateAll() {
		const n = (updates?.plugins?.filter((p) => p.updatable).length ?? 0) +
			(updates?.themes?.filter((t) => t.updatable).length ?? 0);
		const ok = await dialogs.confirm({
			title: 'Update all packages?',
			message: `This will update ${n} package${n !== 1 ? 's' : ''}. Continue?`,
			confirmLabel: 'Update All',
		});
		if (!ok) return;
		updatingAll = true;
		try {
			const result = await updateAllPackages();
			const okCount = result.updated.length;
			const bad = result.failed.length;
			if (bad === 0) {
				toast.success(`Updated ${okCount} package${okCount !== 1 ? 's' : ''}`);
			} else {
				toast.error(`Updated ${okCount}, failed ${bad}: ${result.failed.map((f) => f.package).join(', ')}`);
			}
			await loadDashboard();
		} catch (err: unknown) {
			const detail = err instanceof Error ? err.message : String(err);
			toast.error(`Update failed: ${detail}`);
		} finally {
			updatingAll = false;
		}
	}

	async function handleUpgradeGrav() {
		const target = updates?.grav?.available ?? '';
		const ok = await dialogs.confirm({
			title: 'Upgrade Grav core?',
			message: `This will upgrade Grav from v${updates?.grav?.current ?? ''} to v${target}. The site may be briefly unavailable during the upgrade.`,
			confirmLabel: 'Upgrade Grav',
		});
		if (!ok) return;
		upgradingGrav = true;
		try {
			const result = await upgradeGrav();
			toast.success(`Grav upgraded to v${result.new_version}`);
			await loadDashboard();
		} catch (err: unknown) {
			const detail = err instanceof Error ? err.message : String(err);
			toast.error(`Grav upgrade failed: ${detail}`);
		} finally {
			upgradingGrav = false;
		}
	}

	$effect(() => { if (auth.isAuthenticated) loadDashboard(); });

	// Poll dashboard data every 60s while the tab is visible, and refresh
	// immediately when any mutation (page/user/plugin) happens elsewhere.
	const poller = usePoll(loadDashboard, 60_000, { runImmediately: false });
	onMount(() => {
		poller.start();
		const unsubPages = invalidations.subscribe('pages:*', () => loadDashboard());
		const unsubUsers = invalidations.subscribe('users:*', () => loadDashboard());
		const unsubPlugins = invalidations.subscribe('plugins:*', () => loadDashboard());
		const unsubGpm = invalidations.subscribe('gpm:*', () => loadDashboard());
		return () => {
			poller.stop();
			unsubPages(); unsubUsers(); unsubPlugins(); unsubGpm();
		};
	});
</script>

<svelte:head><title>Dashboard — Grav Admin</title></svelte:head>

{#if loading}
	<div class="flex h-64 items-center justify-center">
		<Loader2 size={24} class="animate-spin text-muted-foreground" />
	</div>
{:else}
<div>
	<StickyHeader>
		{#snippet children({ scrolled })}
			<div class="px-6 transition-[padding] duration-200 {scrolled ? 'py-2' : 'pt-6 pb-3'}">
				<div class="flex items-center justify-between {scrolled ? 'min-h-6' : 'min-h-8'}">
					<div>
						<h1 class="font-semibold tracking-tight text-foreground transition-[font-size] duration-200 {scrolled ? 'text-sm' : 'text-xl'}">Dashboard</h1>
						{#if !scrolled}
							<p class="mt-0.5 text-xs text-muted-foreground">Welcome back, {auth.fullname || auth.username}</p>
						{/if}
					</div>
					<Button variant="outline" size="sm" onclick={loadDashboard}>
						<RefreshCw size={13} />
						Refresh
					</Button>
				</div>
			</div>
		{/snippet}
	</StickyHeader>

	<div class="relative z-0 space-y-5 px-6 pb-6">
		<!-- ═══ Stats Row ═══ -->
	{#if stats}
		<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
			<a href="{base}/pages" class="group flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3 transition-all hover:border-primary/30 hover:shadow-sm">
				<div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
					<FileText size={36} />
				</div>
				<div class="min-w-0">
					<div class="text-3xl font-semibold tabular-nums leading-tight text-foreground">{tweenPages.value}</div>
					<div class="text-[12px] text-muted-foreground">Pages</div>
				</div>
			</a>

			<a href="{base}/users" class="group flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3 transition-all hover:border-primary/30 hover:shadow-sm">
				<div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-500">
					<Users size={36} />
				</div>
				<div class="min-w-0">
					<div class="text-3xl font-semibold tabular-nums leading-tight text-foreground">{tweenUsers.value}</div>
					<div class="text-[12px] text-muted-foreground">Users</div>
				</div>
			</a>

			<a href="{base}/plugins" class="group flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3 transition-all hover:border-primary/30 hover:shadow-sm">
				<div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-teal-500">
					<Puzzle size={36} />
				</div>
				<div class="min-w-0 flex-1">
					<div class="flex items-center gap-2">
						<span class="text-3xl font-semibold tabular-nums leading-tight text-foreground">{tweenPlugins.value}</span>
						{#if totalUpdates > 0}
							<Badge variant="default">{totalUpdates} update{totalUpdates > 1 ? 's' : ''}</Badge>
						{/if}
					</div>
					<div class="text-[12px] text-muted-foreground">Plugins <span class="text-foreground/50">({stats.plugins.active} active)</span></div>
				</div>
			</a>

			<a href="{base}/themes" class="group flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3 transition-all hover:border-primary/30 hover:shadow-sm">
				<div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
					<Palette size={36} />
				</div>
				<div class="min-w-0">
					<div class="text-lg font-semibold leading-tight text-foreground">{stats.theme}</div>
					<div class="text-[12px] text-muted-foreground">Active Theme</div>
				</div>
			</a>
		</div>
	{/if}

	<!-- ═══ Main Grid: Chart + Views Summary ═══ -->
	<div class="grid gap-5 lg:grid-cols-3">
		<!-- Page Views Chart (spans 2 cols) -->
		<div class="flex flex-col rounded-lg border border-border bg-card p-5 lg:col-span-2">
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
				<!-- SVG Area Chart -->
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
							<linearGradient id="areaGradient" x1="0" x2="0" y1="0" y2="1">
								<stop offset="0%" class="[stop-color:var(--primary)]" stop-opacity="0.3" />
								<stop offset="100%" class="[stop-color:var(--primary)]" stop-opacity="0.02" />
							</linearGradient>
						</defs>

						<!-- Grid lines -->
						{#each [0, 0.25, 0.5, 0.75, 1] as tick}
							<line
								x1="40" y1={250 - tick * 220}
								x2="695" y2={250 - tick * 220}
								stroke="currentColor" class="text-border" stroke-width="0.5"
								stroke-dasharray={tick > 0 && tick < 1 ? '3 3' : '0'}
							/>
							<text
								x="35" y={254 - tick * 220}
								text-anchor="end"
								class="fill-muted-foreground"
								font-size="9"
							>{Math.round(chartMax * tick)}</text>
						{/each}

						<!-- Animated chart group — scales Y from baseline -->
						<g style="transform-origin: 0 250px; transition: transform 0.8s cubic-bezier(0.16,1,0.3,1); transform: scaleY({animated ? 1 : 0});">
							<!-- Filled area -->
							<path d={areaPath} fill="url(#areaGradient)" />

							<!-- Curve line -->
							<path d={linePath} fill="none" class="stroke-primary" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />

							<!-- Data points -->
							{#each popularity.chart as point, i}
								{@const p = pts[i]}
								{#if point.views > 0}
									<circle cx={p.x} cy={p.y} r="3" class="fill-primary stroke-card" stroke-width="2" />
								{:else}
									<circle cx={p.x} cy={p.y} r="2" class="fill-muted-foreground/50" />
								{/if}
							{/each}
						</g>

						<!-- Labels (not animated) -->
						{#each popularity.chart as point, i}
							{@const p = pts[i]}

							<!-- Date label -->
							<text
								x={p.x}
								y="268"
								text-anchor="middle"
								class="fill-muted-foreground"
								font-size="8"
							>{point.date.split(' ')[1]}</text>
						{/each}
					</svg>
				</div>
			{:else}
				<div class="flex h-[180px] items-center justify-center text-sm text-muted-foreground">
					No page view data available
				</div>
			{/if}
		</div>

		<!-- Right side: System Health -->
		<div class="space-y-3">
			<!-- Updates status -->
			{#if updates}
				{@const updatablePlugins = updates.plugins.filter((p) => p.updatable)}
				{@const updatableThemes = updates.themes.filter((t) => t.updatable)}
				{@const packageCount = updatablePlugins.length + updatableThemes.length}
				<div class="rounded-lg border border-border bg-card p-4">
					<div class="mb-2 flex items-center justify-between">
						<h2 class="flex items-center gap-2 text-sm font-semibold text-foreground">
							<Shield size={15} />
							Updates
						</h2>
						{#if totalUpdates > 0}
							<span class="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
								{totalUpdates} available
							</span>
						{/if}
					</div>

					{#if totalUpdates === 0}
						<div class="flex items-center gap-2 text-[13px] text-emerald-600 dark:text-emerald-400">
							<CheckCircle2 size={14} />
							Everything up to date
						</div>
					{:else}
						<!-- Grav core upgrade — featured prominently -->
						{#if updates.grav.updatable}
							<div class="relative mb-3 overflow-hidden rounded-lg border border-purple-500/30 bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-transparent p-3 shadow-sm">
								<div class="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-purple-500/10 blur-2xl"></div>
								<div class="relative">
									<div class="flex items-center gap-2 text-[13px] font-semibold text-purple-600 dark:text-purple-400">
										<ArrowUpCircle size={13} />
										Grav Update Available
									</div>
									<div class="mt-1.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
										<span class="tabular-nums">v{updates.grav.current}</span>
										<ArrowRight size={11} class="text-purple-500" />
										<span class="font-semibold tabular-nums text-purple-600 dark:text-purple-400">v{updates.grav.available}</span>
									</div>
									{#if canWriteGpm}
										{#if updates.grav.is_symlink}
											<div class="mt-2 text-[11px] italic text-muted-foreground">
												Grav is installed via symlink — upgrade manually.
											</div>
										{:else}
											<button
												type="button"
												class="mt-2.5 inline-flex h-8 items-center gap-1.5 rounded-md bg-purple-600 px-3 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-purple-700 disabled:opacity-60 dark:bg-purple-500 dark:hover:bg-purple-600"
												onclick={handleUpgradeGrav}
												disabled={updatingAll || upgradingGrav}
											>
												{#if upgradingGrav}
													<Loader2 size={12} class="animate-spin" />
												{:else}
													<ArrowUpCircle size={12} />
												{/if}
												Upgrade Grav
											</button>
										{/if}
									{/if}
								</div>
							</div>
						{/if}

						<!-- Plugin / theme updates -->
						{#if packageCount > 0}
							<div class="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
								<div class="flex items-center gap-2 text-[13px] font-medium text-amber-600 dark:text-amber-400">
									<AlertTriangle size={13} />
									{packageCount} package{packageCount > 1 ? 's' : ''} outdated
								</div>
								<ul class="mt-2 space-y-0.5 text-[12px] text-muted-foreground">
									{#each updatablePlugins.slice(0, 4) as p}
										<li class="flex items-center justify-between gap-2">
											<span class="truncate">{p.name}</span>
											<span class="shrink-0 font-medium tabular-nums text-amber-600/80 dark:text-amber-400/80">v{p.available_version}</span>
										</li>
									{/each}
									{#each updatableThemes.slice(0, Math.max(0, 4 - updatablePlugins.length)) as t}
										<li class="flex items-center justify-between gap-2">
											<span class="truncate">{t.name}</span>
											<span class="shrink-0 font-medium tabular-nums text-amber-600/80 dark:text-amber-400/80">v{t.available_version}</span>
										</li>
									{/each}
									{#if packageCount > 4}
										<li class="text-[11px] italic text-muted-foreground/70">+ {packageCount - 4} more…</li>
									{/if}
								</ul>
								{#if canWriteGpm}
									<button
										type="button"
										class="mt-2.5 inline-flex h-8 items-center gap-1.5 rounded-md bg-amber-500 px-3 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:opacity-60"
										onclick={handleUpdateAll}
										disabled={updatingAll || upgradingGrav}
									>
										{#if updatingAll}
											<Loader2 size={12} class="animate-spin" />
										{:else}
											<ArrowUpCircle size={12} />
										{/if}
										Update All
									</button>
								{/if}
							</div>
						{/if}
					{/if}
				</div>
			{/if}

			<!-- System Info compact card -->
			<div class="rounded-lg border border-border bg-card p-4">
				<h2 class="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
					<Server size={15} />
					System
				</h2>
				<dl class="space-y-2.5 text-[13px]">
					{#if stats}
						<div class="flex items-center justify-between">
							<dt class="text-muted-foreground">Grav</dt>
							<dd class="font-medium tabular-nums text-foreground">v{stats.grav_version}</dd>
						</div>
						<div class="flex items-center justify-between">
							<dt class="text-muted-foreground">PHP</dt>
							<dd class="font-medium tabular-nums text-foreground">v{stats.php_version}</dd>
						</div>
					{/if}
					{#if systemInfo}
						<div class="flex items-center justify-between">
							<dt class="text-muted-foreground">Server</dt>
							<dd class="max-w-[140px] truncate text-right font-medium text-foreground" title={systemInfo.server_software}>{systemInfo.server_software}</dd>
						</div>
					{/if}
					{#if reports}
						<div class="flex items-center justify-between">
							<dt class="text-muted-foreground">Cache</dt>
							<dd class="font-medium text-foreground">
								{#if reports.cache.enabled}
									<span class="text-emerald-500">{reports.cache.driver}</span>
								{:else}
									<span class="text-amber-500">Disabled</span>
								{/if}
							</dd>
						</div>
					{/if}
				</dl>
			</div>

			<!-- Disk usage -->
			{#if reports?.disk}
				<div class="rounded-lg border border-border bg-card p-4">
					<div class="flex items-center justify-between">
						<h2 class="flex items-center gap-2 text-sm font-semibold text-foreground">
							<HardDrive size={15} />
							Disk
						</h2>
						<span class="text-[11px] tabular-nums text-muted-foreground">{diskUsedPercent}% used</span>
					</div>
					<div class="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
						<div
							class="h-full rounded-full {diskUsedPercent > 90 ? 'bg-red-500' : diskUsedPercent > 70 ? 'bg-amber-500' : 'bg-primary'}"
							style="width: {animated ? diskUsedPercent : 0}%; transition: width 0.8s cubic-bezier(0.16,1,0.3,1);"
						></div>
					</div>
					<div class="mt-2 flex justify-between text-[11px] text-muted-foreground">
						<span>{formatBytes(reports.disk.total_space - reports.disk.free_space)} used</span>
						<span>{formatBytes(reports.disk.free_space)} free</span>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- ═══ Bottom Grid: Pages, Top Pages, Backups, Feed ═══ -->
	<div class="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
		<!-- Recent Pages (spans 2 on lg) -->
		<div class="rounded-lg border border-border bg-card p-4 lg:col-span-2">
			<div class="mb-3 flex items-center justify-between">
				<h2 class="flex items-center gap-2 text-sm font-semibold text-foreground">
					<Clock size={15} />
					Recent Pages
				</h2>
				<a href="{base}/pages" class="text-[11px] text-primary hover:underline">View all</a>
			</div>
			{#if recentPages.length > 0}
				<div class="space-y-0.5">
					{#each recentPages.slice(0, 6) as pg}
						<a href="{base}/pages/edit{pg.route}" class="group flex items-center justify-between gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-accent">
							<div class="min-w-0 flex-1">
								<div class="truncate text-[13px] font-medium text-foreground group-hover:text-primary">{pg.title}</div>
								<div class="truncate text-[11px] text-muted-foreground">{pg.route}</div>
							</div>
							<div class="flex shrink-0 items-center gap-2">
								<span class="text-[11px] tabular-nums text-muted-foreground">{formatDate(pg.modified)}</span>
								{#if pg.published}
									<div class="h-1.5 w-1.5 rounded-full bg-emerald-500"></div>
								{:else}
									<div class="h-1.5 w-1.5 rounded-full bg-amber-400"></div>
								{/if}
							</div>
						</a>
					{/each}
				</div>
			{:else}
				<p class="py-6 text-center text-sm text-muted-foreground">No pages found</p>
			{/if}
		</div>

		<!-- Top Pages by Views -->
		{#if popularity?.top_pages && popularity.top_pages.length > 0}
			<div class="rounded-lg border border-border bg-card p-4">
				<h2 class="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
					<Eye size={15} />
					Top Pages
				</h2>
				<div class="space-y-2">
					{#each popularity.top_pages.slice(0, 6) as page}
						{@const maxViews = popularity.top_pages[0].views}
						<div class="group">
							<div class="flex items-center justify-between text-[12px]">
								<span class="min-w-0 flex-1 truncate font-medium text-foreground">{page.route}</span>
								<span class="ml-2 shrink-0 tabular-nums text-muted-foreground">{page.views}</span>
							</div>
							<div class="mt-1 h-1 overflow-hidden rounded-full bg-secondary">
								<div
									class="h-full rounded-full bg-primary/60"
									style="width: {animated ? (page.views / maxViews) * 100 : 0}%; transition: width 0.8s cubic-bezier(0.16,1,0.3,1);"
								></div>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Backups -->
		<div class="rounded-lg border border-border bg-card p-4">
			<h2 class="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
				<Archive size={15} />
				Backups
			</h2>
			{#if backups.length > 0}
				<div class="divide-y divide-border -mx-4">
					{#each backups.slice(0, 5) as backup}
						<div class="flex items-center gap-3 px-4 py-2">
							<div class="min-w-0 flex-1">
								<div class="text-[12px] font-medium text-foreground">{formatDate(backup.date)}</div>
								<div class="text-[11px] text-muted-foreground">{formatBytes(backup.size)}</div>
							</div>
							<a
								href="{auth.serverUrl}{auth.apiPrefix}/system/backups/{encodeURIComponent(backup.filename)}/download?token={auth.accessToken}"
								class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
								title="Download {backup.filename}"
								target="_blank"
							>
								<Download size={14} />
							</a>
						</div>
					{/each}
				</div>
			{:else}
				<p class="py-4 text-center text-[13px] text-muted-foreground">No backups found</p>
			{/if}
		</div>
	</div>

	<!-- ═══ Bottom Row: Notifications + Feed ═══ -->
	<div class="grid gap-5 md:grid-cols-2">
		<!-- Notifications -->
		<div class="rounded-lg border border-border bg-card p-4">
			<h2 class="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
				<Activity size={15} />
				Notifications
			</h2>
			{#if notifications.length > 0}
				<div class="space-y-2.5">
					{#each notifications.slice(0, 6) as notif}
						{#if notif.link}
							<a href={notif.link} target="_blank" rel="noopener noreferrer" class="group flex items-start justify-between gap-3 border-b border-border/50 pb-2 last:border-0 last:pb-0">
								<p class="min-w-0 flex-1 text-[12px] leading-relaxed text-foreground/80 group-hover:text-primary">{@html notif.message}</p>
								<span class="shrink-0 text-[11px] tabular-nums text-muted-foreground">{formatDate(notif.date)}</span>
							</a>
						{:else}
							<div class="flex items-start justify-between gap-3 border-b border-border/50 pb-2 last:border-0 last:pb-0">
								<p class="min-w-0 flex-1 text-[12px] leading-relaxed text-foreground/80">{@html notif.message}</p>
								<span class="shrink-0 text-[11px] tabular-nums text-muted-foreground">{formatDate(notif.date)}</span>
							</div>
						{/if}
					{/each}
				</div>
			{:else}
				<p class="py-4 text-center text-[13px] text-muted-foreground">No notifications</p>
			{/if}
		</div>

		<!-- News Feed -->
		<div class="rounded-lg border border-border bg-card p-4">
			<h2 class="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
				<Rss size={15} />
				News Feed
			</h2>
			{#if feed.length > 0}
				<div class="space-y-2.5">
					{#each feed.slice(0, 8) as item}
						<a href={item.url} target="_blank" rel="noopener noreferrer" class="group flex items-start justify-between gap-3 border-b border-border/50 pb-2 last:border-0 last:pb-0">
							<div class="min-w-0 flex-1">
								<p class="text-[12px] font-medium text-foreground group-hover:text-primary">{item.title}</p>
							</div>
							<span class="shrink-0 text-[11px] tabular-nums text-muted-foreground">{formatDate(item.date)}</span>
						</a>
					{/each}
				</div>
			{:else}
				<p class="py-4 text-center text-[13px] text-muted-foreground">No feed items</p>
			{/if}
		</div>
	</div>
	</div>
</div>
{/if}
