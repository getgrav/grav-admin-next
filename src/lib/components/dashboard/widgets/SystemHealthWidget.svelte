<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { Shield, Server, HardDrive, ArrowUpCircle, AlertTriangle, CheckCircle2, Loader2, FileText, Globe } from 'lucide-svelte';
	import DirectionalIcon from '$lib/components/ui/DirectionalIcon.svelte';
	import { getDashboardData } from '$lib/dashboard/context';
	import { formatBytes } from '$lib/dashboard/format';
	import { webUrl } from '$lib/utils/url';
	import type { UpdatablePackage } from '$lib/api/endpoints/dashboard';

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

<!-- One row of the outdated list. The rows share the list's columns (name,
     links, installed version, new version), so the links and versions line up
     from row to row whatever each name and version is. Each cell names its
     column: the installed version is out of the flow while it's screen-reader
     only, and must not pull the new one into its place. -->
{#snippet packageRow(type: 'plugin' | 'theme', pkg: UpdatablePackage, homepageSlot: boolean)}
	{@const name = pkg.name || pkg.slug}
	{@const homepage = webUrl(pkg.homepage)}
	{@const changesTitle = i18n.t('ADMIN_NEXT.UPDATE_CHANGELOG_TITLE', { version: pkg.available_version })}
	<li class="col-span-full grid grid-cols-subgrid items-center">
		<span class="col-start-1 min-w-0 truncate">{name}</span>
		<!-- 20px targets 6px apart, rows 4px apart: centres at least 24px apart (WCAG 2.5.8).
		     In px, not rem, like the 12px icons, so that holds at any font size. A row
		     without a homepage keeps its place empty, so the changelog stays in line. -->
		<span class="col-start-2 inline-flex items-center gap-[6px]">
			{#if homepage}
				<a href={homepage} target="_blank" rel="noopener noreferrer"
					class="rounded p-[4px] text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
					title={homepage}
					aria-label="{name} — {i18n.t('ADMIN_NEXT.HOMEPAGE')}"
				>
					<Globe size={12} />
				</a>
			{:else if homepageSlot}
				<span class="inline-block size-[20px]" aria-hidden="true"></span>
			{/if}
			<!-- The changelog is asked for by slug: an entry without one has none to show. -->
			{#if pkg.slug}
				<button type="button"
					class="cursor-pointer rounded p-[4px] text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
					title={changesTitle}
					aria-label="{name} — {changesTitle}"
					onclick={() => data().onShowPackageChangelog(type, pkg)}
				>
					<FileText size={12} />
				</button>
			{/if}
		</span>
		{#if pkg.version}
			<!-- Shown only where the list is wide enough, but always read out by screen
			     readers; on screen the new version's tooltip has both versions then.
			     Ends at the arrow, so the arrows line up too. -->
			<span class="col-start-3 sr-only inline-flex items-center gap-1 justify-self-end tabular-nums @xs:not-sr-only">
				<span>v{pkg.version}</span>
				<DirectionalIcon name="arrow-forward" size={10} class="text-amber-500/70" />
			</span>
		{/if}
		<span class="col-start-4 font-medium tabular-nums text-amber-600/80 dark:text-amber-400/80"
			title={pkg.version ? `v${pkg.version} → v${pkg.available_version}` : undefined}
		>v{pkg.available_version}</span>
	</li>
{/snippet}

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
					<span class="rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.6875rem] font-semibold text-amber-600 dark:text-amber-400">
						{i18n.t('ADMIN_NEXT.SYSTEM_HEALTH_WIDGET.UPDATES_AVAILABLE_COUNT', { n: totalUpdates })}
					</span>
				{/if}
			</div>

			{#if totalUpdates === 0}
				<div class="flex items-center gap-2 text-[0.8125rem] text-emerald-600 dark:text-emerald-400">
					<CheckCircle2 size={14} />
					{i18n.t('ADMIN_NEXT.SYSTEM_HEALTH_WIDGET.EVERYTHING_UP_TO_DATE')}
				</div>
			{:else}
				{#if updates.grav.updatable}
					<div class="relative mb-3 overflow-hidden rounded-lg border border-purple-500/30 bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-transparent p-3 shadow-sm">
						<div class="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-purple-500/10 blur-2xl"></div>
						<div class="relative">
							<div class="flex items-center gap-2 text-[0.8125rem] font-semibold text-purple-600 dark:text-purple-400">
								<ArrowUpCircle size={13} />
								{i18n.t('ADMIN_NEXT.SYSTEM_HEALTH_WIDGET.GRAV_UPDATE_AVAILABLE')}
							</div>
							<div class="mt-1.5 flex items-center gap-1.5 text-[0.75rem] text-muted-foreground">
								<span class="tabular-nums">v{updates.grav.current}</span>
								<DirectionalIcon name="arrow-forward" size={11} class="text-purple-500" />
								<span class="font-semibold tabular-nums text-purple-600 dark:text-purple-400">v{updates.grav.available}</span>
							</div>
							<div class="mt-2.5 flex flex-wrap items-center gap-2">
								{#if canWriteGpm && !updates.grav.is_symlink}
									<button type="button"
										class="inline-flex h-8 items-center gap-1.5 rounded-md bg-purple-600 px-3 text-[0.75rem] font-semibold text-white shadow-sm transition-colors hover:bg-purple-700 disabled:opacity-60 dark:bg-purple-500 dark:hover:bg-purple-600"
										onclick={() => data().onUpgradeGrav()}
										disabled={updatingAll || upgradingGrav}
									>
										{#if upgradingGrav}<Loader2 size={12} class="animate-spin" />{:else}<ArrowUpCircle size={12} />{/if}
										{i18n.t('ADMIN_NEXT.SYSTEM_HEALTH_WIDGET.UPGRADE_GRAV')}
									</button>
								{/if}
								<button type="button"
									class="inline-flex h-8 items-center gap-1.5 rounded-md border border-purple-500/30 px-3 text-[0.75rem] font-medium text-purple-600 transition-colors hover:bg-purple-500/10 dark:text-purple-400"
									onclick={() => data().onShowGravChangelog()}
								>
									<FileText size={12} />
									{i18n.t('ADMIN_NEXT.PLUGINS.CHANGELOG')}
								</button>
							</div>
							{#if canWriteGpm && updates.grav.is_symlink}
								<div class="mt-2 text-[0.6875rem] italic text-muted-foreground">
									{i18n.t('ADMIN_NEXT.SYSTEM_HEALTH_WIDGET.GRAV_IS_INSTALLED_VIA_SYMLINK_UPGRADE')}
								</div>
							{/if}
						</div>
					</div>
				{/if}

				{#if packageCount > 0}
					{@const shownPlugins = updatablePlugins.slice(0, 4)}
					{@const shownThemes = updatableThemes.slice(0, Math.max(0, 4 - updatablePlugins.length))}
					<!-- No homepage in any row: no empty place for one either. -->
					{@const homepageSlot = [...shownPlugins, ...shownThemes].some((pkg) => webUrl(pkg.homepage))}
					<div class="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
						<div class="flex items-center gap-2 text-[0.8125rem] font-medium text-amber-600 dark:text-amber-400">
							<AlertTriangle size={13} />
							{i18n.t('ADMIN_NEXT.SYSTEM_HEALTH_WIDGET.PACKAGES_OUTDATED', { n: packageCount })}
						</div>
						<ul class="@container mt-2 grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-2 gap-y-[4px] text-[0.75rem] text-muted-foreground">
							<!-- The index only keys an entry that arrived without a slug. -->
							{#each shownPlugins as p, i (p.slug || i)}
								{@render packageRow('plugin', p, homepageSlot)}
							{/each}
							{#each shownThemes as t, i (t.slug || i)}
								{@render packageRow('theme', t, homepageSlot)}
							{/each}
							{#if packageCount > 4}
								<li class="col-span-full text-[0.6875rem] italic text-muted-foreground/70">{i18n.t('ADMIN_NEXT.SYSTEM_HEALTH_WIDGET.MORE_COUNT', { n: packageCount - 4 })}</li>
							{/if}
						</ul>
						{#if canWriteGpm}
							<button type="button"
								class="mt-2.5 inline-flex h-8 items-center gap-1.5 rounded-md bg-amber-500 px-3 text-[0.75rem] font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:opacity-60"
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
		<dl class="space-y-2.5 text-[0.8125rem]">
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
					<dd class="max-w-[140px] truncate text-end font-medium text-foreground" title={systemInfo.server_software}>{systemInfo.server_software}</dd>
				</div>
			{/if}
			{#if reports}
				<div class="flex items-center justify-between">
					<dt class="text-muted-foreground">{i18n.t('ADMIN_NEXT.SYSTEM_HEALTH_WIDGET.CACHE')}</dt>
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
					{i18n.t('ADMIN_NEXT.SYSTEM_HEALTH_WIDGET.DISK')}
				</h2>
				<span class="text-[0.6875rem] tabular-nums text-muted-foreground">{i18n.t('ADMIN_NEXT.SYSTEM_HEALTH_WIDGET.PERCENT_USED', { percent: diskUsedPercent })}</span>
			</div>
			<div class="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
				<div class="h-full rounded-full {diskUsedPercent > 90 ? 'bg-red-500' : diskUsedPercent > 70 ? 'bg-amber-500' : 'bg-primary'}"
					style="width: {animated ? diskUsedPercent : 0}%; transition: width 0.8s cubic-bezier(0.16,1,0.3,1);"></div>
			</div>
			<div class="mt-2 flex justify-between text-[0.6875rem] text-muted-foreground">
				<span>{i18n.t('ADMIN_NEXT.SYSTEM_HEALTH_WIDGET.BYTES_USED', { size: formatBytes(reports.disk.total_space - reports.disk.free_space) })}</span>
				<span>{i18n.t('ADMIN_NEXT.SYSTEM_HEALTH_WIDGET.BYTES_FREE', { size: formatBytes(reports.disk.free_space) })}</span>
			</div>
		</div>
	{/if}
</div>
