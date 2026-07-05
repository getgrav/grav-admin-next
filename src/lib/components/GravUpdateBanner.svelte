<script lang="ts">
	import { onMount } from 'svelte';
	import { ArrowUpCircle, Loader2, FileText } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import { getUpdates, type UpdatesData } from '$lib/api/endpoints/dashboard';
	import { upgradeGrav, getGravChangelog } from '$lib/api/endpoints/gpm';
	import { formatChangelog } from '$lib/utils/gpm';
	import { canWrite } from '$lib/utils/permissions';
	import { dialogs } from '$lib/stores/dialogs.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { invalidations } from '$lib/stores/invalidation.svelte';
	import DirectionalIcon from '$lib/components/ui/DirectionalIcon.svelte';
	import MarkdownModal from '$lib/components/ui/MarkdownModal.svelte';

	// Optional hook for the host page to refresh its own list after a core
	// upgrade completes (the banner already re-checks and hides itself).
	let { onUpgraded }: { onUpgraded?: () => void } = $props();

	const canWriteGpm = $derived(canWrite('gpm'));

	let grav = $state<UpdatesData['grav'] | null>(null);
	let upgrading = $state(false);

	// Changelog modal
	let changelogOpen = $state(false);
	let changelogContent = $state('');
	let changelogLoading = $state(false);

	async function refresh() {
		try {
			const updates = await getUpdates();
			grav = updates.grav;
		} catch {
			// A failed check just leaves the banner hidden — the dashboard is the
			// authoritative place for update state; no toast needed here.
			grav = null;
		}
	}

	async function handleUpgrade() {
		const target = grav?.available ?? '';
		const ok = await dialogs.confirm({
			title: 'Upgrade Grav core?',
			message: `This will upgrade Grav from v${grav?.current ?? ''} to v${target}. The site may be briefly unavailable during the upgrade.`,
			confirmLabel: i18n.t('ADMIN_NEXT.SYSTEM_HEALTH_WIDGET.UPGRADE_GRAV'),
		});
		if (!ok) return;
		upgrading = true;
		const toastId = toast.loading(`Upgrading Grav to v${target}…`);
		try {
			const result = await upgradeGrav();
			toast.success(i18n.t('ADMIN_NEXT.TOASTS.GRAV_UPGRADED', { version: result.new_version }), { id: toastId });
			await refresh();
			onUpgraded?.();
		} catch (err: unknown) {
			toast.error(`Grav upgrade failed: ${err instanceof Error ? err.message : String(err)}`, { id: toastId });
		} finally {
			upgrading = false;
		}
	}

	async function handleShowChangelog() {
		changelogLoading = true;
		changelogContent = '';
		changelogOpen = true;
		try {
			changelogContent = formatChangelog(await getGravChangelog());
		} catch {
			changelogContent = '*Changelog not available.*';
		} finally {
			changelogLoading = false;
		}
	}

	onMount(() => {
		refresh();
		// Update state can change from actions elsewhere in the admin (a check on
		// the plugins page, an update-all, etc.) — refetch so the banner appears
		// or clears without a hard reload.
		const unsub = invalidations.subscribe('gpm:*', () => refresh());
		return () => { unsub(); };
	});
</script>

{#if canWriteGpm && grav?.updatable}
	<div class="px-4 pt-3">
		<div class="relative overflow-hidden rounded-lg border border-purple-500/30 bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-transparent p-3 shadow-sm">
			<div class="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-purple-500/10 blur-2xl"></div>
			<div class="relative flex flex-wrap items-center gap-x-4 gap-y-2">
				<div class="min-w-0 flex-1">
					<div class="flex items-center gap-2 text-[0.8125rem] font-semibold text-purple-600 dark:text-purple-400">
						<ArrowUpCircle size={14} />
						{i18n.t('ADMIN_NEXT.SYSTEM_HEALTH_WIDGET.GRAV_UPDATE_AVAILABLE')}
					</div>
					<div class="mt-1 flex items-center gap-1.5 text-[0.75rem] text-muted-foreground">
						<span class="tabular-nums">v{grav.current}</span>
						<DirectionalIcon name="arrow-forward" size={11} class="text-purple-500" />
						<span class="font-semibold tabular-nums text-purple-600 dark:text-purple-400">v{grav.available}</span>
					</div>
				</div>
				<div class="flex flex-wrap items-center gap-2">
					{#if !grav.is_symlink}
						<button
							type="button"
							class="inline-flex h-8 items-center gap-1.5 rounded-md bg-purple-600 px-3 text-[0.75rem] font-semibold text-white shadow-sm transition-colors hover:bg-purple-700 disabled:opacity-60 dark:bg-purple-500 dark:hover:bg-purple-600"
							onclick={handleUpgrade}
							disabled={upgrading}
						>
							{#if upgrading}<Loader2 size={12} class="animate-spin" />{:else}<ArrowUpCircle size={12} />{/if}
							{i18n.t('ADMIN_NEXT.SYSTEM_HEALTH_WIDGET.UPGRADE_GRAV')}
						</button>
					{/if}
					<button
						type="button"
						class="inline-flex h-8 items-center gap-1.5 rounded-md border border-purple-500/30 px-3 text-[0.75rem] font-medium text-purple-600 transition-colors hover:bg-purple-500/10 dark:text-purple-400"
						onclick={handleShowChangelog}
					>
						<FileText size={12} />
						{i18n.t('ADMIN_NEXT.PLUGINS.CHANGELOG')}
					</button>
				</div>
			</div>
			{#if grav.is_symlink}
				<div class="relative mt-2 text-[0.6875rem] italic text-muted-foreground">
					{i18n.t('ADMIN_NEXT.SYSTEM_HEALTH_WIDGET.GRAV_IS_INSTALLED_VIA_SYMLINK_UPGRADE')}
				</div>
			{/if}
		</div>
	</div>
{/if}

<MarkdownModal
	open={changelogOpen}
	title={i18n.t('ADMIN_NEXT.PLUGINS.CHANGELOG')}
	content={changelogLoading ? 'Loading...' : changelogContent}
	onclose={() => { changelogOpen = false; }}
/>
