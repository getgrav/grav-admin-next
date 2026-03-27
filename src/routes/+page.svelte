<script lang="ts">
	import { auth } from '$lib/stores/auth.svelte';
	import { getStats, getNotifications } from '$lib/api/endpoints/dashboard';
	import { getSystemInfo, clearCache } from '$lib/api/endpoints/system';
	import { getRecentPages } from '$lib/api/endpoints/pages';
	import type { DashboardStats, Notification } from '$lib/api/endpoints/dashboard';
	import type { SystemInfo } from '$lib/api/endpoints/system';
	import type { PageSummary } from '$lib/api/endpoints/pages';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import {
		FileText, Users, Puzzle, Palette, Server, RefreshCw, Trash2,
		ExternalLink, Clock, AlertCircle, CheckCircle, Info
	} from 'lucide-svelte';

	let stats = $state<DashboardStats | null>(null);
	let systemInfo = $state<SystemInfo | null>(null);
	let notifications = $state<Notification[]>([]);
	let recentPages = $state<PageSummary[]>([]);
	let loading = $state(true);
	let error = $state('');
	let cacheClearing = $state(false);
	let cacheMessage = $state('');

	async function loadDashboard() {
		loading = true;
		error = '';
		try {
			const results = await Promise.allSettled([
				getStats(), getSystemInfo(), getNotifications(), getRecentPages(5)
			]);
			if (results[0].status === 'fulfilled') stats = results[0].value;
			if (results[1].status === 'fulfilled') systemInfo = results[1].value;
			if (results[2].status === 'fulfilled') notifications = results[2].value;
			if (results[3].status === 'fulfilled') recentPages = results[3].value;
			if (results.every(r => r.status === 'rejected')) {
				error = 'Unable to load dashboard data. Check your server connection.';
			}
		} catch {
			error = 'Failed to load dashboard';
		} finally {
			loading = false;
		}
	}

	async function handleClearCache() {
		cacheClearing = true;
		cacheMessage = '';
		try {
			const result = await clearCache();
			cacheMessage = result.message || 'Cache cleared successfully';
			setTimeout(() => cacheMessage = '', 3000);
		} catch { cacheMessage = 'Failed to clear cache'; }
		finally { cacheClearing = false; }
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

	$effect(() => { if (auth.isAuthenticated) loadDashboard(); });
</script>

<svelte:head><title>Dashboard — Grav Admin</title></svelte:head>

<div class="mx-auto max-w-7xl space-y-5">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-xl font-semibold tracking-tight text-foreground">Dashboard</h1>
			<p class="mt-0.5 text-[13px] text-muted-foreground">Welcome back, {auth.fullname || auth.username}</p>
		</div>
		<Button variant="outline" size="sm" onclick={loadDashboard} disabled={loading}>
			<RefreshCw size={13} class={loading ? 'animate-spin' : ''} />
			Refresh
		</Button>
	</div>

	{#if error}
		<div class="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950/30 dark:text-red-300">
			<AlertCircle size={18} />
			<span>{error}</span>
		</div>
	{/if}

	<!-- Stats Grid -->
	{#if stats}
		<div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
			<div class="rounded-lg border border-border bg-card p-4">
				<div class="flex items-center gap-3">
					<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
						<FileText size={20} />
					</div>
					<div>
						<div class="text-2xl font-semibold text-foreground">{stats.pages.total}</div>
						<div class="text-xs text-muted-foreground">Pages</div>
					</div>
				</div>
			</div>
			<div class="rounded-lg border border-border bg-card p-4">
				<div class="flex items-center gap-3">
					<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
						<Users size={20} />
					</div>
					<div>
						<div class="text-2xl font-semibold text-foreground">{stats.users.total}</div>
						<div class="text-xs text-muted-foreground">Users</div>
					</div>
				</div>
			</div>
			<div class="rounded-lg border border-border bg-card p-4">
				<div class="flex items-center gap-3">
					<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-500/10 text-teal-500">
						<Puzzle size={20} />
					</div>
					<div>
						<div class="text-2xl font-semibold text-foreground">{stats.plugins.total}</div>
						<div class="text-xs text-muted-foreground">Plugins</div>
					</div>
				</div>
			</div>
			<div class="rounded-lg border border-border bg-card p-4">
				<div class="flex items-center gap-3">
					<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
						<Palette size={20} />
					</div>
					<div>
						<div class="text-sm font-semibold text-foreground">{stats.theme}</div>
						<div class="text-xs text-muted-foreground">Theme</div>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<div class="grid gap-5 lg:grid-cols-3">
		<!-- Left column -->
		<div class="space-y-5">
			{#if systemInfo || stats}
				<div class="rounded-lg border border-border bg-card p-4">
					<h2 class="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
						<Server size={15} />
						System Info
					</h2>
					<dl class="space-y-2 text-[13px]">
						{#if stats}
							<div class="flex justify-between">
								<dt class="text-muted-foreground">Grav</dt>
								<dd class="font-medium text-foreground">v{stats.grav_version}</dd>
							</div>
							<div class="flex justify-between">
								<dt class="text-muted-foreground">PHP</dt>
								<dd class="font-medium text-foreground">v{stats.php_version}</dd>
							</div>
						{/if}
						{#if systemInfo}
							<div class="flex justify-between">
								<dt class="text-muted-foreground">Server</dt>
								<dd class="max-w-[150px] truncate font-medium text-foreground" title={systemInfo.server_software}>{systemInfo.server_software}</dd>
							</div>
							<div class="flex justify-between">
								<dt class="text-muted-foreground">Memory</dt>
								<dd class="font-medium text-foreground">{systemInfo.memory_limit}</dd>
							</div>
							<div class="flex justify-between">
								<dt class="text-muted-foreground">Timezone</dt>
								<dd class="font-medium text-foreground">{systemInfo.timezone}</dd>
							</div>
						{/if}
						{#if stats?.last_backup}
							<div class="flex justify-between">
								<dt class="text-muted-foreground">Last Backup</dt>
								<dd class="font-medium text-foreground">{formatDate(stats.last_backup)}</dd>
							</div>
						{/if}
					</dl>
				</div>
			{/if}

			<div class="rounded-lg border border-border bg-card p-4">
				<h2 class="mb-3 text-sm font-semibold text-foreground">Quick Actions</h2>
				<Button variant="outline" class="w-full justify-start gap-2" size="sm" onclick={handleClearCache} disabled={cacheClearing}>
					<Trash2 size={14} />
					{cacheClearing ? 'Clearing...' : 'Clear Cache'}
				</Button>
				{#if cacheMessage}
					<div class="mt-2 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
						<CheckCircle size={12} />
						{cacheMessage}
					</div>
				{/if}
			</div>
		</div>

		<!-- Center: Recent Pages -->
		<div class="rounded-lg border border-border bg-card p-4">
			<div class="mb-3 flex items-center justify-between">
				<h2 class="flex items-center gap-2 text-sm font-semibold text-foreground">
					<Clock size={15} />
					Recent Pages
				</h2>
				<a href="/pages" class="text-xs text-primary hover:underline">View all</a>
			</div>

			{#if recentPages.length > 0}
				<ul class="-mx-2 space-y-0.5">
					{#each recentPages as pg}
						<li>
							<a href="/pages/edit{pg.route}" class="group flex items-start justify-between gap-2 rounded-md px-2 py-2 transition-colors hover:bg-accent">
								<div class="min-w-0 flex-1">
									<div class="truncate text-sm font-medium text-foreground group-hover:text-primary">{pg.title}</div>
									<div class="mt-0.5 truncate text-xs text-muted-foreground">{pg.route}</div>
								</div>
								<div class="shrink-0 text-right">
									<span class="text-xs text-muted-foreground">{formatDate(pg.modified)}</span>
									<div class="mt-0.5">
										{#if pg.published}
											<Badge variant="success">Published</Badge>
										{:else}
											<Badge variant="secondary">Draft</Badge>
										{/if}
									</div>
								</div>
							</a>
						</li>
					{/each}
				</ul>
			{:else if !loading}
				<p class="py-8 text-center text-sm text-muted-foreground">No pages found</p>
			{/if}
		</div>

		<!-- Right: Notifications -->
		<div class="rounded-lg border border-border bg-card p-4">
			<h2 class="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
				<Info size={15} />
				Notifications
			</h2>

			{#if notifications.length > 0}
				<ul class="space-y-3">
					{#each notifications.slice(0, 8) as notif}
						<li class="border-b border-border pb-2 last:border-0">
							{#if notif.link}
								<a href={notif.link} target="_blank" rel="noopener noreferrer" class="group flex items-start gap-2">
									<ExternalLink size={12} class="mt-1 shrink-0 text-muted-foreground" />
									<div>
										<p class="text-[13px] text-foreground/80 group-hover:text-primary">{@html notif.message}</p>
										<span class="text-xs text-muted-foreground">{formatDate(notif.date)}</span>
									</div>
								</a>
							{:else}
								<p class="text-[13px] text-foreground/80">{@html notif.message}</p>
								<span class="text-xs text-muted-foreground">{formatDate(notif.date)}</span>
							{/if}
						</li>
					{/each}
				</ul>
			{:else if !loading}
				<p class="py-4 text-center text-sm text-muted-foreground">No notifications</p>
			{/if}
		</div>
	</div>
</div>
