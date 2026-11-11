<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import {
		getDashboardNotifications, getPopularity, getFeed, getBackups, getUpdates, getSystemInfoOverview,
		toDashboardNotifications, toBackupList, type DashboardNotifications, type FeedData,
		type Notification, type PopularityData,
		type FeedItem, type BackupInfo, type UpdatesData, type UpdatablePackage, type SystemInfoOverview
	} from '$lib/api/endpoints/dashboard';
	import { getWidgets, saveUserLayout, saveSiteLayout } from '$lib/api/endpoints/dashboard-widgets';
	import {
		updateAllPackages, getGravChangelog, getPluginAvailableChangelog, getThemeAvailableChangelog
	} from '$lib/api/endpoints/gpm';
	import { confirmAndUpgradeGrav } from '$lib/utils/grav-upgrade';
	import { reloadIfAdminUpdated, formatChangelog } from '$lib/utils/gpm';
	import MarkdownModal from '$lib/components/ui/MarkdownModal.svelte';
	import { createTextModal } from '$lib/utils/text-modal.svelte';
	import { createBackup } from '$lib/api/endpoints/tools';
	import { canWrite } from '$lib/utils/permissions';
	import { dialogs } from '$lib/stores/dialogs.svelte';
	import { getSystemInfo, type SystemInfo } from '$lib/api/endpoints/system';
	import { getRecentPages, toRecentPages, type PageSummary } from '$lib/api/endpoints/pages';
	import { getDashboardBatch, type DashboardBatch } from '$lib/api/endpoints/dashboard-batch';
	import type { DashboardWidgetsResponse } from '$lib/dashboard/types';
	import { onlyEditablePages } from '$lib/utils/admin2-config';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import { usePoll } from '$lib/utils/poll.svelte';
	import { invalidations } from '$lib/stores/invalidation.svelte';
	import { dashboardStats } from '$lib/stores/dashboardStats.svelte';
	import { onMount, untrack } from 'svelte';
	import { RefreshCw, Loader2 } from 'lucide-svelte';
	import StickyHeader from '$lib/components/ui/StickyHeader.svelte';
	import TopProgressBar from '$lib/components/ui/TopProgressBar.svelte';
	import DashboardGrid from '$lib/components/dashboard/DashboardGrid.svelte';
	import EditModeToolbar from '$lib/components/dashboard/EditModeToolbar.svelte';
	import WidgetPicker from '$lib/components/dashboard/WidgetPicker.svelte';
	import TopBanner from '$lib/components/dashboard/TopBanner.svelte';
	import PromoBanner from '$lib/components/dashboard/PromoBanner.svelte';
	import SecurityHealthBanner from '$lib/components/dashboard/SecurityHealthBanner.svelte';
	import type { ProbeResult } from '$lib/api/security-probes';
	import { checkSensitiveFileExposure } from '$lib/api/endpoints/security';
	import { setDashboardData, type DashboardData } from '$lib/dashboard/context';
	import { formatBytes } from '$lib/dashboard/format';
	import type { ResolvedWidget, DashboardLayout } from '$lib/dashboard/types';
	import type { PresetDef } from '$lib/dashboard/presets';

	// Shared with the sidebar badges and the pages list (one request serves all).
	const stats = $derived(dashboardStats.value);
	let systemInfo = $state<SystemInfo | null>(null);
	let notifications = $state<Notification[]>([]);
	let topNotifications = $state<Notification[]>([]);
	let bannerNotifications = $state<Notification[]>([]);
	let recentPages = $state<PageSummary[]>([]);
	let popularity = $state<PopularityData | null>(null);
	let feed = $state<FeedItem[]>([]);
	let backups = $state<BackupInfo[]>([]);
	let updates = $state<UpdatesData | null>(null);
	let reports = $state<SystemInfoOverview | null>(null);
	let widgets = $state<ResolvedWidget[]>([]);
	let savedWidgetsSnapshot = $state<ResolvedWidget[]>([]);
	let canEditSite = $state(false);
	let userFolderExposed = $state(false);
	let exposedFiles = $state<string[]>([]);
	let exposureResults = $state<ProbeResult[]>([]);
	let loading = $state(true);
	let animated = $state(false);
	let updatingAll = $state(false);
	let upgradingGrav = $state(false);
	let creatingBackup = $state(false);

	let editMode = $state(false);
	let saving = $state(false);
	let pickerOpen = $state(false);

	// Changelog modal: what the Grav core update, or that of an outdated plugin or theme, changes
	const changelog = createTextModal();

	function handleShowGravChangelog() {
		return changelog.show({
			kind: 'update',
			title: () => `Grav — ${i18n.t('ADMIN_NEXT.UPDATE_CHANGELOG_TITLE', { version: updates?.grav.available ?? '' })}`,
			load: async () => formatChangelog(await getGravChangelog()),
		});
	}

	function handleShowPackageChangelog(type: 'plugin' | 'theme', pkg: UpdatablePackage) {
		// The changelog is asked for by slug; the widget offers none without one.
		const slug = pkg.slug;
		if (!slug) return;
		return changelog.show({
			kind: 'update',
			title: () => `${pkg.name || slug} — ${i18n.t('ADMIN_NEXT.UPDATE_CHANGELOG_TITLE', { version: pkg.available_version })}`,
			load: async () =>
				formatChangelog(await (type === 'plugin' ? getPluginAvailableChangelog(slug) : getThemeAvailableChangelog(slug))),
		});
	}

	const dirty = $derived(JSON.stringify(widgets) !== JSON.stringify(savedWidgetsSnapshot));

	const canWriteGpm = $derived(canWrite('gpm'));
	const canWriteSystem = $derived(canWrite('system'));

	setDashboardData((): DashboardData => ({
		stats, systemInfo, notifications, recentPages, popularity, feed, backups, updates, reports,
		animated, updatingAll, upgradingGrav, creatingBackup, canWriteGpm, canWriteSystem,
		onUpdateAll: handleUpdateAll,
		onUpgradeGrav: handleUpgradeGrav,
		onShowGravChangelog: handleShowGravChangelog,
		onShowPackageChangelog: handleShowPackageChangelog,
		onCreateBackup: handleCreateBackup,
	}));

	interface LoadDashboardOptions {
		flushGpm?: boolean;
		silent?: boolean;
	}

	let securityCheckRunning = false;

	// Probe sensitive storage directories over the web. Kept off the dashboard
	// payload so a slow or blocked external fetch never delays the rest of the
	// page, and guarded so repeated Refresh clicks don't stack probe requests.
	// The answer is kept for the browser session (each blocked probe is a red
	// 403 in the console); `force` re-checks, so fixing the server rules and
	// pressing Refresh clears the banner.
	function refreshSecurityHealth(force = false) {
		if (securityCheckRunning) return;
		securityCheckRunning = true;
		checkSensitiveFileExposure(force)
			.then((result) => {
				userFolderExposed = result.exposed === true;
				exposedFiles = result.exposedFiles;
				exposureResults = result.results ?? [];
			})
			.finally(() => { securityCheckRunning = false; });
	}

	/**
	 * Each piece of the dashboard, loaded on its own so an invalidation only
	 * refetches what it affects. `force` asks the server to skip its caches
	 * (the Refresh button).
	 */
	const show = {
		systemInfo: (v: SystemInfo) => { systemInfo = v; },
		notifications: (v: DashboardNotifications) => {
			notifications = v.dashboard;
			topNotifications = v.top;
			bannerNotifications = v.banner;
		},
		recentPages: (v: PageSummary[]) => { recentPages = v; },
		popularity: (v: PopularityData) => { popularity = v; },
		feed: (v: FeedData) => { feed = (v as { feed?: FeedItem[] })?.feed ?? []; },
		backups: (v: BackupInfo[]) => { backups = v; },
		updates: (v: UpdatesData) => { updates = v; },
		reports: (v: SystemInfoOverview) => { reports = v; },
		widgets: (v: DashboardWidgetsResponse) => {
			// Never replace a layout the user is in the middle of editing.
			if (editMode) return;
			widgets = v.widgets;
			savedWidgetsSnapshot = JSON.parse(JSON.stringify(widgets));
			canEditSite = v.can_edit_site;
		},
	};

	const loaders = {
		stats: (force: boolean) => (force ? dashboardStats.load() : dashboardStats.ensure()),
		systemInfo: () => getSystemInfo().then(show.systemInfo),
		notifications: (force: boolean) => getDashboardNotifications(force).then(show.notifications),
		recentPages: () => getRecentPages(8, { editable: onlyEditablePages() }).then(show.recentPages),
		popularity: () => getPopularity().then(show.popularity),
		feed: (force: boolean) => getFeed(force).then(show.feed),
		backups: () => getBackups().then(show.backups),
		updates: (force: boolean) => getUpdates(force).then(show.updates),
		reports: () => getSystemInfoOverview().then(show.reports),
		widgets: () => getWidgets().then(show.widgets),
	} satisfies Record<string, (force: boolean) => Promise<unknown>>;

	type Part = keyof typeof loaders;
	const ALL_PARTS = Object.keys(loaders) as Part[];

	/**
	 * Show the parts that came in the combined request, each through the same
	 * conversion its own loader uses. Returns the parts still to load.
	 */
	function showBatch(batch: DashboardBatch): Part[] {
		const shown = new Set<Part>(['stats']);
		const use = <T,>(part: Part, value: T | undefined, apply: (v: T) => void) => {
			if (value === undefined) return;
			apply(value);
			shown.add(part);
		};
		use('systemInfo', batch.system_info, show.systemInfo);
		use('notifications', batch.notifications, (v) => show.notifications(toDashboardNotifications(v)));
		use('recentPages', batch.recent_pages, (v) => show.recentPages(toRecentPages(v)));
		use('popularity', batch.popularity, show.popularity);
		use('feed', batch.feed, show.feed);
		use('backups', batch.backups, (v) => show.backups(toBackupList(v)));
		use('updates', batch.updates, show.updates);
		use('reports', batch.reports, show.reports);
		use('widgets', batch.widgets, show.widgets);
		return ALL_PARTS.filter((part) => !shown.has(part));
	}

	async function refreshParts(parts: Iterable<Part>, force = false) {
		await Promise.allSettled([...parts].map((part) => loaders[part](force)));
	}

	/**
	 * Every part but the stats, in one request (`/admin-next/dashboard`). A
	 * part it couldn't answer, or every part on an older API, comes from its
	 * own endpoint.
	 */
	async function loadCombined() {
		const batch = await getDashboardBatch(onlyEditablePages());
		await refreshParts(batch ? showBatch(batch) : ALL_PARTS.filter((part) => part !== 'stats'));
	}

	async function loadDashboard(options: LoadDashboardOptions = {}) {
		const { flushGpm = false, silent = false } = options;
		if (!silent) loading = true;
		try {
			// A silent reload follows a change (an update, an upgrade), so the
			// stats must be fresh; a first visit may reuse the sidebar's copy.
			// Refresh and the reloads after a change ask each endpoint directly,
			// so Refresh can skip their caches.
			const rest = ALL_PARTS.filter((part) => part !== 'stats');
			await Promise.allSettled([
				loaders.stats(flushGpm || silent),
				silent || flushGpm ? refreshParts(rest, flushGpm) : loadCombined(),
			]);
		} finally {
			// The exposure probe is a dozen requests of its own. Started once the
			// dashboard's data is in, so they don't hold up its requests on a
			// connection-limited (HTTP/1.1) host. Silent refreshes (after an
			// update or a backup) leave the probe alone.
			if (!silent) refreshSecurityHealth(flushGpm);
			if (!silent) {
				loading = false;
				animated = false;
				requestAnimationFrame(() => requestAnimationFrame(() => { animated = true; }));
			}
		}
	}

	function widgetsToLayout(ws: ResolvedWidget[]): DashboardLayout {
		return {
			preset: 'custom',
			widgets: ws.map(w => ({
				id: w.id,
				visible: w.visible,
				size: w.size,
				order: w.order,
			})),
		};
	}

	async function handleSaveUser() {
		saving = true;
		try {
			const res = await saveUserLayout(widgetsToLayout(widgets));
			widgets = res.widgets;
			savedWidgetsSnapshot = JSON.parse(JSON.stringify(widgets));
			editMode = false;
			toast.success(i18n.t('ADMIN_NEXT.DASHBOARD.LAYOUT_SAVED'));
		} catch (err: unknown) {
			toast.error(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			saving = false;
		}
	}

	async function handleSaveSite() {
		const ok = await dialogs.confirm({
			title: 'Save as site default?',
			message: 'This layout will become the default for every user on this site. Widgets you hide here will be hidden for everyone and cannot be re-enabled per-user.',
			confirmLabel: 'Save site default',
		});
		if (!ok) return;
		saving = true;
		try {
			const res = await saveSiteLayout(widgetsToLayout(widgets));
			widgets = res.widgets;
			savedWidgetsSnapshot = JSON.parse(JSON.stringify(widgets));
			editMode = false;
			toast.success(i18n.t('ADMIN_NEXT.DASHBOARD.SITE_LAYOUT_SAVED'));
		} catch (err: unknown) {
			toast.error(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			saving = false;
		}
	}

	function handleApplyPreset(preset: PresetDef) {
		const layout = preset.apply();
		const layoutById = new Map(layout.widgets.map(w => [w.id, w]));
		widgets = widgets.map(w => {
			const entry = layoutById.get(w.id);
			if (!entry) return w;
			return {
				...w,
				visible: entry.visible ?? w.visible,
				size: (entry.size as typeof w.size) ?? w.size,
				order: entry.order ?? w.order,
			};
		}).sort((a, b) => a.order - b.order);
	}

	async function handleResetToDefault() {
		const ok = await dialogs.confirm({
			title: 'Reset your layout?',
			message: 'Your personal customizations will be cleared. The site default layout will apply.',
			confirmLabel: 'Reset',
		});
		if (!ok) return;
		saving = true;
		try {
			const res = await saveUserLayout({ preset: 'default', widgets: [] });
			widgets = res.widgets;
			savedWidgetsSnapshot = JSON.parse(JSON.stringify(widgets));
			editMode = false;
			toast.success(i18n.t('ADMIN_NEXT.DASHBOARD.LAYOUT_RESET'));
		} catch (err: unknown) {
			toast.error(`Reset failed: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			saving = false;
		}
	}

	function handleCancel() {
		widgets = JSON.parse(JSON.stringify(savedWidgetsSnapshot));
		editMode = false;
	}

	function addWidget(id: string) {
		const maxOrder = Math.max(0, ...widgets.map(w => w.order));
		widgets = widgets.map(w => w.id === id ? { ...w, visible: true, order: maxOrder + 1 } : w);
	}

	async function handleUpdateAll() {
		const updatable = [
			...(updates?.plugins?.filter(p => p.updatable) ?? []),
			...(updates?.themes?.filter(t => t.updatable) ?? []),
		];
		const n = updatable.length;
		const ok = await dialogs.confirm({
			title: i18n.t('ADMIN_NEXT.SYSTEM_HEALTH_WIDGET.UPDATE_ALL_CONFIRM_TITLE'),
			message: i18n.t('ADMIN_NEXT.SYSTEM_HEALTH_WIDGET.UPDATE_ALL_CONFIRM_MESSAGE', { n }),
			items: updatable.map(p => `${p.name || p.slug || ''} ${p.version ? `v${p.version} → ` : ''}v${p.available_version}`.trim()),
			confirmLabel: i18n.t('ADMIN_NEXT.SYSTEM_HEALTH_WIDGET.UPDATE_ALL'),
		});
		if (!ok) return;
		updatingAll = true;
		const toastId = toast.loading(`Updating ${n} package${n !== 1 ? 's' : ''}…`);
		try {
			const result = await updateAllPackages();
			// Cascaded deps that were themselves updatable land in `skipped`, not
			// `updated` — count them too so the toast matches what the user asked for.
			const okCount = result.updated.length + result.skipped.length;
			const bad = result.failed.length;
			if (bad === 0) {
				toast.success(i18n.t('ADMIN_NEXT.TOASTS.PACKAGES_UPDATED', { n: okCount }), { id: toastId });
			} else {
				const reasons = result.failed.map(f => `${f.package}: ${f.error}`).join('\n');
				toast.error(
					(okCount > 0
						? i18n.t('ADMIN_NEXT.TOASTS.PACKAGES_UPDATED', { n: okCount }) + ' · '
						: '') + `${reasons}`,
					{ id: toastId },
				);
			}
			await loadDashboard({ silent: true });
			reloadIfAdminUpdated([...result.updated, ...result.cascaded_dependencies]);
		} catch (err: unknown) {
			toast.error(i18n.t('ADMIN_NEXT.TOASTS.UPDATE_FAILED', { detail: err instanceof Error ? err.message : String(err) }), { id: toastId });
		} finally {
			updatingAll = false;
		}
	}

	async function handleUpgradeGrav() {
		const result = await confirmAndUpgradeGrav(
			updates?.grav?.current ?? '',
			updates?.grav?.available ?? '',
			(busy) => {
				upgradingGrav = busy;
			}
		);
		if (result) await loadDashboard({ silent: true });
	}

	async function handleCreateBackup() {
		creatingBackup = true;
		const toastId = toast.loading(i18n.t('ADMIN_NEXT.APP.CREATING_BACKUP'));
		try {
			const result = await createBackup();
			toast.success(i18n.t('ADMIN_NEXT.TOASTS.BACKUP_CREATED', { size: formatBytes(result.size) }), { id: toastId });
			// A backup changes the backup list and the stats' last-backup date.
			await Promise.allSettled([loaders.backups(), dashboardStats.load()]);
		} catch (err: unknown) {
			toast.error(`Backup failed: ${err instanceof Error ? err.message : String(err)}`, { id: toastId });
		} finally {
			creatingBackup = false;
		}
	}

	// Untracked: the loaders read shared stores (the stats' age, for one), and
	// a change there must not re-run the whole first load.
	$effect(() => { if (auth.isAuthenticated) untrack(() => loadDashboard()); });

	// Only notifications change on their own, so they are all the timer
	// fetches: one request a minute instead of eleven. Everything else is
	// refreshed by the invalidations below, or by the Refresh button.
	const poller = usePoll(() => loaders.notifications(false), 60_000, { runImmediately: false });

	// Which parts each kind of change can affect. Several tags from one
	// response are coalesced, so a burst fetches each part once.
	const PARTS_FOR: Array<[string, Part[]]> = [
		['pages:*', ['stats', 'recentPages']],
		['users:*', ['stats']],
		['media:*', ['stats']],
		['plugins:*', ['stats', 'systemInfo', 'reports', 'widgets']],
		['themes:*', ['stats', 'systemInfo']],
		['gpm:*', ['stats', 'updates', 'systemInfo', 'reports', 'widgets']],
		['grav:*', ['updates', 'systemInfo']],
		// Config saves elsewhere in the admin (system.yaml, plugin configs,
		// etc.) can change cache status and system-health flags.
		['config:*', ['systemInfo', 'reports']],
	];

	onMount(() => {
		poller.start();
		const pending = new Set<Part>();
		let scheduled = false;
		const queue = (parts: Part[]) => {
			for (const part of parts) pending.add(part);
			if (scheduled) return;
			scheduled = true;
			queueMicrotask(() => {
				scheduled = false;
				const run = [...pending];
				pending.clear();
				// Stats may already be on their way from the sidebar badges;
				// load() joins that request rather than sending another.
				void refreshParts(run.filter((p) => p !== 'stats'));
				if (run.includes('stats')) void dashboardStats.load();
			});
		};
		const unsubs = PARTS_FOR.map(([pattern, parts]) => invalidations.subscribe(pattern, () => queue(parts)));
		return () => {
			poller.stop();
			for (const unsub of unsubs) unsub();
		};
	});
</script>

<svelte:head><title>{i18n.t('ADMIN_NEXT.APP.DASHBOARD_GRAV_ADMIN')}</title></svelte:head>

<TopProgressBar active={updatingAll || upgradingGrav || creatingBackup} />

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
							<h1 class="font-semibold tracking-tight text-foreground transition-[font-size] duration-200 {scrolled ? 'text-sm' : 'text-xl'}">{i18n.t('ADMIN_NEXT.DASHBOARD.TITLE')}</h1>
							{#if !scrolled && !editMode}
								<p class="mt-0.5 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.APP.WELCOME_BACK', { name: auth.fullname || auth.username })}</p>
							{:else if editMode}
								<p class="mt-0.5 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.DASHBOARD.EDIT_HINT')}</p>
							{/if}
						</div>
						<div class="flex items-center gap-2">
							{#if !editMode}
								<Button variant="outline" size="sm" onclick={() => loadDashboard({ flushGpm: true })}>
									<RefreshCw size={13} />
									{i18n.t('ADMIN_NEXT.APP.REFRESH')}
								</Button>
							{/if}
							<EditModeToolbar
								bind:editMode
								{dirty}
								{saving}
								{canEditSite}
								onSaveUser={handleSaveUser}
								onSaveSite={canEditSite ? handleSaveSite : undefined}
								onApplyPreset={handleApplyPreset}
								onCancel={handleCancel}
								onResetToDefault={handleResetToDefault}
							/>
						</div>
					</div>
				</div>
			{/snippet}
		</StickyHeader>

		<div class="relative z-0 px-6 pb-6">
			<SecurityHealthBanner exposed={userFolderExposed} {exposedFiles} results={exposureResults} />
			<TopBanner notifications={topNotifications} />
			<DashboardGrid
				{widgets}
				{editMode}
				onChange={(next) => widgets = next}
				onAddClick={() => pickerOpen = true}
			>
				{#snippet afterStats()}
					<PromoBanner slides={bannerNotifications} />
				{/snippet}
			</DashboardGrid>
		</div>

		<WidgetPicker {widgets} bind:open={pickerOpen} onAdd={addWidget} />
	</div>
{/if}

<MarkdownModal
	open={changelog.open}
	title={changelog.title}
	content={changelog.content}
	onclose={changelog.close}
/>
