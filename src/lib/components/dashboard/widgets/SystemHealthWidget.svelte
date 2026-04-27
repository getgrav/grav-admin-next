<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { Shield, Server, HardDrive, ArrowRight, ArrowUpCircle, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-svelte';
	import { getDashboardData } from '$lib/dashboard/context';
	import { formatBytes } from '$lib/dashboard/format';

	const data = getDashboardData();
	const stats = $derived(data().stats);
	const systemInfo = $derived(data().systemInfo);
	const reports = $derived(data().reports);
	const updates = $derived(data().updates);
	const animated = $derived(data().animated);
	const canWriteGpm = $derived(data().canWriteGpm);
	const updatingAll = $derived(data().updatingAll);
	const upgradingGrav = $derived(data().upgradingGrav);

	const totalUpdates = $derived(updates?.total ?? 0);
	const diskUsedPercent = $derived(
		reports?.disk
			? Math.round(((reports.disk.total_space - reports.disk.free_space) / reports.disk.total_space) * 100)
			: 0
	);
</script>

<div class="flex h-full flex-col gap-3">
	{#if updates}
		{@const updatablePlugins = updates.plugins.filter(p => p.updatable)}
		{@const updatableThemes = updates.themes.filter(t => t.updatable)}
		{@const packageCount = updatablePlugins.length + updatableThemes.length}
		<div class="rounded-lg border border-border bg-card p-4">
			<div class="mb-2 flex items-center justify-between">
				<h2 class="flex items-center gap-2 text-sm font-semibold text-foreground">
					<Shield size={15} />
					{i18n.t('ADMIN_NEXT.SYSTEM_HEALTH_WIDGET.UPDATES')}
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
					{i18n.t('ADMIN_NEXT.SYSTEM_HEALTH_WIDGET.EVERYTHING_UP_TO_DATE')}
				</div>
			{:else}
				{#if updates.grav.updatable}
					<div class="relative mb-3 overflow-hidden rounded-lg border border-purple-500/30 bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-transparent p-3 shadow-sm">
						<div class="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-purple-500/10 blur-2xl"></div>
						<div class="relative">
							<div class="flex items-center gap-2 text-[13px] font-semibold text-purple-600 dark:text-purple-400">
								<ArrowUpCircle size={13} />
								{i18n.t('ADMIN_NEXT.SYSTEM_HEALTH_WIDGET.GRAV_UPDATE_AVAILABLE')}
							</div>
							<div class="mt-1.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
								<span class="tabular-nums">v{updates.grav.current}</span>
								<ArrowRight size={11} class="text-purple-500" />
								<span class="font-semibold tabular-nums text-purple-600 dark:text-purple-400">v{updates.grav.available}</span>
							</div>
							{#if canWriteGpm}
								{#if updates.grav.is_symlink}
									<div class="mt-2 text-[11px] italic text-muted-foreground">
										{i18n.t('ADMIN_NEXT.SYSTEM_HEALTH_WIDGET.GRAV_IS_INSTALLED_VIA_SYMLINK_UPGRADE')}
									</div>
								{:else}
									<button type="button"
										class="mt-2.5 inline-flex h-8 items-center gap-1.5 rounded-md bg-purple-600 px-3 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-purple-700 disabled:opacity-60 dark:bg-purple-500 dark:hover:bg-purple-600"
										onclick={() => data().onUpgradeGrav()}
										disabled={updatingAll || upgradingGrav}
									>
										{#if upgradingGrav}<Loader2 size={12} class="animate-spin" />{:else}<ArrowUpCircle size={12} />{/if}
										{i18n.t('ADMIN_NEXT.SYSTEM_HEALTH_WIDGET.UPGRADE_GRAV')}
									</button>
								{/if}
							{/if}
						</div>
					</div>
				{/if}

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
							<button type="button"
								class="mt-2.5 inline-flex h-8 items-center gap-1.5 rounded-md bg-amber-500 px-3 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:opacity-60"
								onclick={() => data().onUpdateAll()}
								disabled={updatingAll || upgradingGrav}
							>
								{#if updatingAll}<Loader2 size={12} class="animate-spin" />{:else}<ArrowUpCircle size={12} />{/if}
								{i18n.t('ADMIN_NEXT.SYSTEM_HEALTH_WIDGET.UPDATE_ALL')}
							</button>
						{/if}
					</div>
				{/if}
			{/if}
		</div>
	{/if}

	<div class="rounded-lg border border-border bg-card p-4">
		<h2 class="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
			<Server size={15} />
			{i18n.t('ADMIN_NEXT.NAV.SYSTEM')}
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
					<dt class="text-muted-foreground">{i18n.t('ADMIN_NEXT.SYSTEM_HEALTH_WIDGET.SERVER')}</dt>
					<dd class="max-w-[140px] truncate text-right font-medium text-foreground" title={systemInfo.server_software}>{systemInfo.server_software}</dd>
				</div>
			{/if}
			{#if reports}
				<div class="flex items-center justify-between">
					<dt class="text-muted-foreground">Cache</dt>
					<dd class="font-medium text-foreground">
						{#if reports.cache.enabled}<span class="text-emerald-500">{reports.cache.driver}</span>{:else}<span class="text-amber-500">{i18n.t('ADMIN_NEXT.DISABLED')}</span>{/if}
					</dd>
				</div>
			{/if}
		</dl>
	</div>

	{#if reports?.disk}
		<div class="rounded-lg border border-border bg-card p-4">
			<div class="flex items-center justify-between">
				<h2 class="flex items-center gap-2 text-sm font-semibold text-foreground">
					<HardDrive size={15} />
					Disk
				</h2>
				<span class="text-[11px] tabular-nums text-muted-foreground">{i18n.t('ADMIN_NEXT.SYSTEM_HEALTH_WIDGET.PERCENT_USED', { percent: diskUsedPercent })}</span>
			</div>
			<div class="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
				<div class="h-full rounded-full {diskUsedPercent > 90 ? 'bg-red-500' : diskUsedPercent > 70 ? 'bg-amber-500' : 'bg-primary'}"
					style="width: {animated ? diskUsedPercent : 0}%; transition: width 0.8s cubic-bezier(0.16,1,0.3,1);"></div>
			</div>
			<div class="mt-2 flex justify-between text-[11px] text-muted-foreground">
				<span>{formatBytes(reports.disk.total_space - reports.disk.free_space)} used</span>
				<span>{formatBytes(reports.disk.free_space)} free</span>
			</div>
		</div>
	{/if}
</div>
