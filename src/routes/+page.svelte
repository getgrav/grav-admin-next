<script lang="ts">
	import { auth } from '$lib/stores/auth.svelte';
	import {
		getStats, getNotifications, getTopNotifications, getPopularity, getFeed, getBackups, getUpdates, getSystemInfoOverview,
		type DashboardStats, type Notification, type PopularityData,
		type FeedItem, type BackupInfo, type UpdatesData, type SystemInfoOverview
	} from '$lib/api/endpoints/dashboard';
	import { getWidgets, saveUserLayout, saveSiteLayout } from '$lib/api/endpoints/dashboard-widgets';
	import { updateAllPackages, upgradeGrav } from '$lib/api/endpoints/gpm';
	import { createBackup } from '$lib/api/endpoints/tools';
	import { canWrite } from '$lib/utils/permissions';
	import { dialogs } from '$lib/stores/dialogs.svelte';
	import { getSystemInfo, type SystemInfo } from '$lib/api/endpoints/system';
	import { getRecentPages, type PageSummary } from '$lib/api/endpoints/pages';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import { usePoll } from '$lib/utils/poll.svelte';
	import { invalidations } from '$lib/stores/invalidation.svelte';
	import { onMount } from 'svelte';
	import { RefreshCw, Loader2 } from 'lucide-svelte';
	import StickyHeader from '$lib/components/ui/StickyHeader.svelte';
	import TopProgressBar from '$lib/components/ui/TopProgressBar.svelte';
	import DashboardGrid from '$lib/components/dashboard/DashboardGrid.svelte';
	import EditModeToolbar from '$lib/components/dashboard/EditModeToolbar.svelte';
	import WidgetPicker from '$lib/components/dashboard/WidgetPicker.svelte';
	import TopBanner from '$lib/components/dashboard/TopBanner.svelte';
	import { setDashboardData, type DashboardData } from '$lib/dashboard/context';
	import { formatBytes } from '$lib/dashboard/format';
	import type { ResolvedWidget, DashboardLayout } from '$lib/dashboard/types';
	import type { PresetDef } from '$lib/dashboard/presets';

	let stats = $state<DashboardStats | null>(null);
	let systemInfo = $state<SystemInfo | null>(null);
	let notifications = $state<Notification[]>([]);
	let topNotifications = $state<Notification[]>([]);
	let recentPages = $state<PageSummary[]>([]);
	let popularity = $state<PopularityData | null>(null);
	let feed = $state<FeedItem[]>([]);
	let backups = $state<BackupInfo[]>([]);
	let updates = $state<UpdatesData | null>(null);
	let reports = $state<SystemInfoOverview | null>(null);
	let widgets = $state<ResolvedWidget[]>([]);
	let savedWidgetsSnapshot = $state<ResolvedWidget[]>([]);
	let canEditSite = $state(false);
	let loading = $state(true);
	let animated = $state(false);
	let updatingAll = $state(false);
	let upgradingGrav = $state(false);
	let creatingBackup = $state(false);

	let editMode = $state(false);
	let saving = $state(false);
	let pickerOpen = $state(false);
	const dirty = $derived(JSON.stringify(widgets) !== JSON.stringify(savedWidgetsSnapshot));

	const canWriteGpm = $derived(canWrite('gpm'));
	const canWriteSystem = $derived(canWrite('system'));

	setDashboardData((): DashboardData => ({
		stats, systemInfo, notifications, recentPages, popularity, feed, backups, updates, reports,
		animated, updatingAll, upgradingGrav, creatingBackup, canWriteGpm, canWriteSystem,
		onUpdateAll: handleUpdateAll,
		onUpgradeGrav: handleUpgradeGrav,
		onCreateBackup: handleCreateBackup,
	}));

	interface LoadDashboardOptions {
		flushGpm?: boolean;
		silent?: boolean;
	}

	async function loadDashboard(options: LoadDashboardOptions = {}) {
		const { flushGpm = false, silent = false } = options;
		if (!silent) loading = true;
		try {
			const results = await Promise.allSettled([
				getStats(), getSystemInfo(), getNotifications(flushGpm), getRecentPages(8),
				getPopularity(), getFeed(flushGpm), getBackups(), getUpdates(flushGpm),
				getSystemInfoOverview(), getWidgets(), getTopNotifications(flushGpm),
			]);
			if (results[0].status === 'fulfilled') stats = results[0].value;
			if (results[1].status === 'fulfilled') systemInfo = results[1].value;
			if (results[2].status === 'fulfilled') notifications = results[2].value;
			if (results[3].status === 'fulfilled') recentPages = results[3].value;
			if (results[4].status === 'fulfilled') popularity = results[4].value;
			if (results[5].status === 'fulfilled') feed = (results[5].value as { feed?: FeedItem[] })?.feed ?? [];
			if (results[6].status === 'fulfilled') backups = results[6].value;
			if (results[7].status === 'fulfilled') updates = results[7].value;
			if (results[8].status === 'fulfilled') reports = results[8].value;
			if (results[9].status === 'fulfilled') {
				widgets = results[9].value.widgets;
				savedWidgetsSnapshot = JSON.parse(JSON.stringify(widgets));
				canEditSite = results[9].value.can_edit_site;
			}
			if (results[10].status === 'fulfilled') topNotifications = results[10].value;
		} finally {
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
			toast.success('Dashboard layout saved');
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
			toast.success('Site default saved');
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
			toast.success('Layout reset to default');
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
		const n = (updates?.plugins?.filter(p => p.updatable).length ?? 0) +
			(updates?.themes?.filter(t => t.updatable).length ?? 0);
		const ok = await dialogs.confirm({
			title: 'Update all packages?',
			message: `This will update ${n} package${n !== 1 ? 's' : ''}. Continue?`,
			confirmLabel: 'Update All',
		});
		if (!ok) return;
		updatingAll = true;
		const toastId = toast.loading(`Updating ${n} package${n !== 1 ? 's' : ''}…`);
		try {
			const result = await updateAllPackages();
			const okCount = result.updated.length;
			const bad = result.failed.length;
			if (bad === 0) {
				toast.success(`Updated ${okCount} package${okCount !== 1 ? 's' : ''}`, { id: toastId });
			} else {
				const reasons = result.failed.map(f => `${f.package}: ${f.error}`).join('\n');
				toast.error(
					okCount > 0
						? `Updated ${okCount}, failed ${bad}.\n${reasons}`
						: `${bad} update${bad !== 1 ? 's' : ''} failed.\n${reasons}`,
					{ id: toastId },
				);
			}
			await loadDashboard({ silent: true });
		} catch (err: unknown) {
			toast.error(`Update failed: ${err instanceof Error ? err.message : String(err)}`, { id: toastId });
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
		const toastId = toast.loading(`Upgrading Grav to v${target}…`);
		try {
			const result = await upgradeGrav();
			toast.success(`Grav upgraded to v${result.new_version}`, { id: toastId });
			await loadDashboard({ silent: true });
		} catch (err: unknown) {
			toast.error(`Grav upgrade failed: ${err instanceof Error ? err.message : String(err)}`, { id: toastId });
		} finally {
			upgradingGrav = false;
		}
	}

	async function handleCreateBackup() {
		creatingBackup = true;
		const toastId = toast.loading('Creating backup…');
		try {
			const result = await createBackup();
			toast.success(`Backup created (${formatBytes(result.size)})`, { id: toastId });
			await loadDashboard({ silent: true });
		} catch (err: unknown) {
			toast.error(`Backup failed: ${err instanceof Error ? err.message : String(err)}`, { id: toastId });
		} finally {
			creatingBackup = false;
		}
	}

	$effect(() => { if (auth.isAuthenticated) loadDashboard(); });

	const poller = usePoll(() => loadDashboard({ silent: true }), 60_000, { runImmediately: false });
	onMount(() => {
		poller.start();
		const unsubPages = invalidations.subscribe('pages:*', () => loadDashboard({ silent: true }));
		const unsubUsers = invalidations.subscribe('users:*', () => loadDashboard({ silent: true }));
		const unsubPlugins = invalidations.subscribe('plugins:*', () => loadDashboard({ silent: true }));
		const unsubGpm = invalidations.subscribe('gpm:*', () => loadDashboard({ silent: true }));
		return () => {
			poller.stop();
			unsubPages(); unsubUsers(); unsubPlugins(); unsubGpm();
		};
	});
</script>

<svelte:head><title>Dashboard — Grav Admin</title></svelte:head>

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
							<h1 class="font-semibold tracking-tight text-foreground transition-[font-size] duration-200 {scrolled ? 'text-sm' : 'text-xl'}">Dashboard</h1>
							{#if !scrolled && !editMode}
								<p class="mt-0.5 text-xs text-muted-foreground">Welcome back, {auth.fullname || auth.username}</p>
							{:else if editMode}
								<p class="mt-0.5 text-xs text-muted-foreground">Customize mode — drag, resize, hide widgets, then save.</p>
							{/if}
						</div>
						<div class="flex items-center gap-2">
							{#if !editMode}
								<Button variant="outline" size="sm" onclick={() => loadDashboard({ flushGpm: true })}>
									<RefreshCw size={13} />
									Refresh
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
			<TopBanner notifications={topNotifications} />
			<DashboardGrid
				{widgets}
				{editMode}
				onChange={(next) => widgets = next}
				onAddClick={() => pickerOpen = true}
			/>
		</div>

		<WidgetPicker {widgets} bind:open={pickerOpen} onAdd={addWidget} />
	</div>
{/if}
