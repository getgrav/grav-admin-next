<script lang="ts">
	import { base } from '$app/paths';
	import { auth } from '$lib/stores/auth.svelte';
	import {
		getStats, getNotifications, getPopularity, getFeed, getBackups, getUpdates, getReports,
		type DashboardStats, type Notification, type PopularityData,
		type FeedItem, type BackupInfo, type UpdatesData, type ReportsData
	} from '$lib/api/endpoints/dashboard';
	import { getSystemInfo } from '$lib/api/endpoints/system';
	import { getRecentPages } from '$lib/api/endpoints/pages';
	import type { SystemInfo } from '$lib/api/endpoints/system';
	import type { PageSummary } from '$lib/api/endpoints/pages';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { toast } from 'svelte-sonner';
	import {
		FileText, Users, Puzzle, Palette, RefreshCw, Clock,
		ExternalLink, ArrowUpRight, ArrowDownRight, Minus,
		TrendingUp, Eye, HardDrive, Shield, Rss, Archive,
		CheckCircle2, AlertTriangle, Loader2, Server, Activity
	} from 'lucide-svelte';

	let stats = $state<DashboardStats | null>(null);
	let systemInfo = $state<SystemInfo | null>(null);
	let notifications = $state<Notification[]>([]);
	let recentPages = $state<PageSummary[]>([]);
	let popularity = $state<PopularityData | null>(null);
	let feed = $state<FeedItem[]>([]);
	let backups = $state<BackupInfo[]>([]);
	let updates = $state<UpdatesData | null>(null);
	let reports = $state<ReportsData | null>(null);
	let loading = $state(true);

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
				getReports(),
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

	$effect(() => { if (auth.isAuthenticated) loadDashboard(); });
</script>

<svelte:head><title>Dashboard — Grav Admin</title></svelte:head>

{#if loading}
	<div class="flex h-64 items-center justify-center">
		<Loader2 size={24} class="animate-spin text-muted-foreground" />
	</div>
{:else}
<div class="space-y-5 p-5">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-xl font-semibold tracking-tight text-foreground">Dashboard</h1>
			<p class="mt-0.5 text-[13px] text-muted-foreground">Welcome back, {auth.fullname || auth.username}</p>
		</div>
		<Button variant="outline" size="sm" onclick={loadDashboard}>
			<RefreshCw size={13} />
			Refresh
		</Button>
	</div>

	<!-- ═══ Stats Row ═══ -->
	{#if stats}
		<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
			<a href="{base}/pages" class="group flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3 transition-all hover:border-primary/30 hover:shadow-sm">
				<div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
					<FileText size={36} />
				</div>
				<div class="min-w-0">
					<div class="text-3xl font-semibold tabular-nums leading-tight text-foreground">{stats.pages.total}</div>
					<div class="text-[12px] text-muted-foreground">Pages</div>
				</div>
			</a>

			<a href="{base}/users" class="group flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3 transition-all hover:border-primary/30 hover:shadow-sm">
				<div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-500">
					<Users size={36} />
				</div>
				<div class="min-w-0">
					<div class="text-3xl font-semibold tabular-nums leading-tight text-foreground">{stats.users.total}</div>
					<div class="text-[12px] text-muted-foreground">Users</div>
				</div>
			</a>

			<a href="{base}/plugins" class="group flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3 transition-all hover:border-primary/30 hover:shadow-sm">
				<div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-teal-500">
					<Puzzle size={36} />
				</div>
				<div class="min-w-0 flex-1">
					<div class="flex items-center gap-2">
						<span class="text-3xl font-semibold tabular-nums leading-tight text-foreground">{stats.plugins.total}</span>
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
		<div class="rounded-lg border border-border bg-card p-5 lg:col-span-2">
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
				<!-- SVG Bar Chart -->
				<div class="relative mt-2">
					<svg viewBox="0 0 700 180" class="w-full" preserveAspectRatio="xMidYMid meet">
						<!-- Grid lines -->
						{#each [0, 0.25, 0.5, 0.75, 1] as tick}
							<line
								x1="40" y1={160 - tick * 140}
								x2="690" y2={160 - tick * 140}
								stroke="currentColor" class="text-border" stroke-width="0.5"
								stroke-dasharray={tick > 0 && tick < 1 ? '3 3' : '0'}
							/>
							<text
								x="35" y={164 - tick * 140}
								text-anchor="end"
								class="fill-muted-foreground"
								font-size="9"
							>{Math.round(chartMax * tick)}</text>
						{/each}

						<!-- Bars -->
						{#each popularity.chart as point, i}
							{@const barWidth = 30}
							{@const gap = (650 - barWidth * 14) / 13}
							{@const x = 45 + i * (barWidth + gap)}
							{@const height = chartMax > 0 ? (point.views / chartMax) * 140 : 0}
							{@const y = 160 - height}

							<rect
								{x} {y}
								width={barWidth}
								height={Math.max(height, 0)}
								rx="3"
								class={point.views > 0
									? 'fill-primary/80 transition-all hover:fill-primary'
									: 'fill-muted/50'}
							/>

							<!-- Value label on hover -->
							{#if point.views > 0}
								<text
									x={x + barWidth / 2}
									y={y - 5}
									text-anchor="middle"
									class="fill-muted-foreground opacity-0 transition-opacity"
									font-size="9"
									font-weight="600"
								>{point.views}</text>
							{/if}

							<!-- Date label -->
							<text
								x={x + barWidth / 2}
								y="175"
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
							class="h-full rounded-full transition-all {diskUsedPercent > 90 ? 'bg-red-500' : diskUsedPercent > 70 ? 'bg-amber-500' : 'bg-primary'}"
							style:width="{diskUsedPercent}%"
						></div>
					</div>
					<div class="mt-2 flex justify-between text-[11px] text-muted-foreground">
						<span>{formatBytes(reports.disk.total_space - reports.disk.free_space)} used</span>
						<span>{formatBytes(reports.disk.free_space)} free</span>
					</div>
				</div>
			{/if}

			<!-- Updates status -->
			{#if updates}
				<div class="rounded-lg border border-border bg-card p-4">
					<h2 class="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
						<Shield size={15} />
						Updates
					</h2>
					{#if totalUpdates === 0}
						<div class="flex items-center gap-2 text-[13px] text-emerald-600 dark:text-emerald-400">
							<CheckCircle2 size={14} />
							Everything up to date
						</div>
					{:else}
						<div class="flex items-center gap-2 text-[13px] text-amber-600 dark:text-amber-400">
							<AlertTriangle size={14} />
							{totalUpdates} update{totalUpdates > 1 ? 's' : ''} available
						</div>
						<ul class="mt-2 space-y-1 text-[12px] text-muted-foreground">
							{#if updates.grav.updatable}
								<li>Grav {updates.grav.available}</li>
							{/if}
							{#each updates.plugins.filter(p => p.updatable).slice(0, 3) as p}
								<li>{p.name} {p.available_version}</li>
							{/each}
						</ul>
					{/if}
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
									style:width="{(page.views / maxViews) * 100}%"
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
				<div class="space-y-2">
					{#each backups.slice(0, 5) as backup}
						<div class="flex items-center justify-between text-[12px]">
							<div class="min-w-0 flex-1">
								<div class="truncate font-medium text-foreground">{formatDate(backup.date)}</div>
							</div>
							<span class="shrink-0 tabular-nums text-muted-foreground">{formatBytes(backup.size)}</span>
						</div>
					{/each}
				</div>
			{:else if stats?.last_backup}
				<div class="text-[13px] text-muted-foreground">
					Last backup: {formatDate(stats.last_backup)}
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
						<div class="border-b border-border/50 pb-2 last:border-0 last:pb-0">
							{#if notif.link}
								<a href={notif.link} target="_blank" rel="noopener noreferrer" class="group flex items-start gap-2">
									<ExternalLink size={11} class="mt-1 shrink-0 text-muted-foreground/60" />
									<div class="min-w-0 flex-1">
										<p class="text-[12px] leading-relaxed text-foreground/80 group-hover:text-primary">{@html notif.message}</p>
										<span class="text-[11px] text-muted-foreground">{formatDate(notif.date)}</span>
									</div>
								</a>
							{:else}
								<p class="text-[12px] leading-relaxed text-foreground/80">{@html notif.message}</p>
								<span class="text-[11px] text-muted-foreground">{formatDate(notif.date)}</span>
							{/if}
						</div>
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
					{#each feed.slice(0, 6) as item}
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
{/if}
