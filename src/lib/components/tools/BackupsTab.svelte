<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { getBackups, createBackup, deleteBackup, getBackupDownloadUrl } from '$lib/api/endpoints/tools';
	import type { Backup, PurgeConfig } from '$lib/api/endpoints/tools';
	import { Button } from '$lib/components/ui/button';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import { Download, Trash2, Plus, Loader2 } from 'lucide-svelte';

	let backups = $state<Backup[]>([]);
	let purge = $state<PurgeConfig | null>(null);
	let profilesCount = $state(0);
	let loading = $state(true);
	let creating = $state(false);
	let confirmDelete = $state<string | null>(null);

	// Stats
	const totalCount = $derived(backups.length);
	const totalSize = $derived(backups.reduce((sum, b) => sum + b.size, 0));
	const newestDate = $derived(backups.length > 0 ? backups[0].date : null);
	const oldestDate = $derived(backups.length > 0 ? backups[backups.length - 1].date : null);

	// Storage usage
	const maxBytes = $derived(purge?.trigger === 'space' ? (purge.max_backups_space * 1024 * 1024 * 1024) : 0);
	const usagePercent = $derived(maxBytes > 0 ? Math.min(100, Math.round((totalSize / maxBytes) * 100)) : 0);
	const usageLabel = $derived(() => {
		if (!purge) return '';
		if (purge.trigger === 'space') return `Using ${formatSize(totalSize)} of ${purge.max_backups_space} GB`;
		if (purge.trigger === 'number') return `${totalCount} of ${purge.max_backups_count} backups`;
		if (purge.trigger === 'time') return `Keeping last ${purge.max_backups_time} days`;
		return '';
	});

	async function load() {
		loading = true;
		try {
			const result = await getBackups();
			backups = result.backups ?? [];
			purge = result.purge ?? null;
			profilesCount = result.profiles_count ?? 0;
		} catch (err) {
			toast.error(i18n.t('ADMIN_NEXT.TOOLS.BACKUPS.FAILED_TO_LOAD_BACKUPS'));
		} finally {
			loading = false;
		}
	}

	async function handleCreate() {
		creating = true;
		try {
			await createBackup();
			toast.success(i18n.t('ADMIN_NEXT.TOOLS.BACKUPS.BACKUP_CREATED_SUCCESSFULLY'));
			await load();
		} catch (err) {
			toast.error(i18n.t('ADMIN_NEXT.TOOLS.BACKUPS.FAILED_TO_CREATE_BACKUP'));
		} finally {
			creating = false;
		}
	}

	async function handleDelete() {
		if (!confirmDelete) return;
		const filename = confirmDelete;
		confirmDelete = null;
		try {
			await deleteBackup(filename);
			toast.success(i18n.t('ADMIN_NEXT.TOOLS.BACKUPS.BACKUP_DELETED'));
			await load();
		} catch (err) {
			toast.error(i18n.t('ADMIN_NEXT.TOOLS.BACKUPS.FAILED_TO_DELETE_BACKUP'));
		}
	}

	function formatSize(bytes: number): string {
		if (bytes === 0) return '0 B';
		const units = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(1024));
		return (bytes / Math.pow(1024, i)).toFixed(i > 1 ? 2 : 0) + ' ' + units[i];
	}

	function formatDate(dateStr: string | null): string {
		if (!dateStr) return '—';
		return new Date(dateStr).toLocaleDateString(undefined, {
			year: 'numeric', month: 'short', day: 'numeric',
			hour: '2-digit', minute: '2-digit',
		});
	}

	function relativeTime(dateStr: string | null): string {
		if (!dateStr) return '—';
		const diff = Date.now() - new Date(dateStr).getTime();
		const secs = Math.floor(diff / 1000);
		if (secs < 60) return `${secs} secs`;
		const mins = Math.floor(secs / 60);
		if (mins < 60) return `${mins} min${mins > 1 ? 's' : ''}`;
		const hrs = Math.floor(mins / 60);
		if (hrs < 24) return `${hrs} hr${hrs > 1 ? 's' : ''}`;
		const days = Math.floor(hrs / 24);
		if (days < 7) return `${days} day${days > 1 ? 's' : ''}`;
		const weeks = Math.floor(days / 7);
		if (weeks < 5) return `${weeks} wk${weeks > 1 ? 's' : ''}`;
		const months = Math.floor(days / 30);
		return `${months} mo${months > 1 ? 's' : ''}`;
	}

	onMount(load);
</script>

<div class="space-y-4">
	<!-- Backup Statistics Banner -->
	<div class="overflow-hidden rounded-lg border border-primary/20 bg-primary/5">
		<div class="px-5 pt-4 pb-3">
			<h3 class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.TOOLS.BACKUPS.BACKUP_STATISTICS')}</h3>
		</div>

		<!-- Storage Usage Bar -->
		{#if purge}
			<div class="px-5 pb-3">
				<div class="relative h-8 w-full overflow-hidden rounded-md bg-primary/10">
					<div
						class="absolute inset-0 rounded-md"
						style="background: linear-gradient(to right, #22c55e 0%, #22c55e 40%, #eab308 65%, #ef4444 100%); clip-path: inset(0 {100 - Math.max(usagePercent, 2)}% 0 0); transition: clip-path 0.5s ease;"
					></div>
					<div class="absolute inset-0 flex items-center justify-end pr-3">
						<span class="text-xs font-semibold text-foreground">{usageLabel()}</span>
					</div>
				</div>
			</div>
		{/if}

		<!-- Stats Row -->
		<div class="grid grid-cols-4 divide-x divide-primary/10 border-t border-primary/10 bg-primary/[0.03]">
			<div class="px-4 py-3 text-center">
				<p class="text-2xl font-bold text-foreground">{totalCount}</p>
				<p class="text-[11px] font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.TOOLS.BACKUPS.NUMBER_OF_BACKUPS')}</p>
			</div>
			<div class="px-4 py-3 text-center">
				<p class="text-2xl font-bold text-foreground">{profilesCount}</p>
				<p class="text-[11px] font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.TOOLS.BACKUPS.NUMBER_OF_PROFILES')}</p>
			</div>
			<div class="px-4 py-3 text-center">
				<p class="text-2xl font-bold text-foreground">{relativeTime(newestDate)}</p>
				<p class="text-[11px] font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.TOOLS.BACKUPS.NEWEST_BACKUP')}</p>
			</div>
			<div class="px-4 py-3 text-center">
				<p class="text-2xl font-bold text-foreground">{relativeTime(oldestDate)}</p>
				<p class="text-[11px] font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.TOOLS.BACKUPS.OLDEST_BACKUP')}</p>
			</div>
		</div>
	</div>

	<!-- Actions -->
	<div class="flex items-center justify-between">
		<h3 class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.TOOLS.BACKUPS.BACKUP_HISTORY')}</h3>
		<Button size="sm" onclick={handleCreate} disabled={creating}>
			{#if creating}
				<Loader2 size={14} class="animate-spin" />
				{i18n.t('ADMIN_NEXT.TOOLS.BACKUPS.CREATING')}
			{:else}
				<Plus size={14} />
				{i18n.t('ADMIN_NEXT.TOOLS.BACKUPS.BACKUP_NOW')}
			{/if}
		</Button>
	</div>

	<!-- Backup List -->
	<div class="rounded-lg border border-border bg-card">
		{#if loading}
			<div class="p-8 text-center text-sm text-muted-foreground">{i18n.t('ADMIN_NEXT.TOOLS.BACKUPS.LOADING_BACKUPS')}</div>
		{:else if backups.length === 0}
			<div class="p-8 text-center text-sm text-muted-foreground">{i18n.t('ADMIN_NEXT.TOOLS.BACKUPS.NO_BACKUPS_FOUND_CREATE_ONE_TO_GET')}</div>
		{:else}
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-border text-left text-xs font-medium text-muted-foreground">
						<th class="px-4 py-3 w-8">#</th>
						<th class="px-4 py-3">{i18n.t('ADMIN_NEXT.TOOLS.BACKUPS.BACKUP_DATE')}</th>
						<th class="px-4 py-3">Name</th>
						<th class="px-4 py-3 text-right">Size</th>
						<th class="px-4 py-3 text-right">{i18n.t('ADMIN_NEXT.TOOLS.BACKUPS.ACTION')}</th>
					</tr>
				</thead>
				<tbody>
					{#each backups as backup, i (backup.filename)}
						<tr class="border-b border-border last:border-0 hover:bg-muted/30">
							<td class="px-4 py-3 text-muted-foreground">{i + 1}</td>
							<td class="px-4 py-3 text-foreground">{formatDate(backup.date)}</td>
							<td class="px-4 py-3 text-muted-foreground">{backup.title || 'Default Site Backup'}</td>
							<td class="px-4 py-3 text-right text-muted-foreground">{formatSize(backup.size)}</td>
							<td class="px-4 py-3 text-right">
								<div class="flex items-center justify-end gap-1">
									<a
										href={getBackupDownloadUrl(backup.filename)}
										class="inline-flex h-7 w-7 items-center justify-center rounded-md text-primary transition-colors hover:bg-primary/10"
										title={i18n.t('ADMIN_NEXT.DOWNLOAD')}
									>
										<Download size={14} />
									</a>
									<button
										class="inline-flex h-7 w-7 items-center justify-center rounded-md text-destructive transition-colors hover:bg-destructive/10"
										title={i18n.t('ADMIN_NEXT.DELETE')}
										onclick={() => { confirmDelete = backup.filename; }}
									>
										<Trash2 size={14} />
									</button>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>
</div>

<ConfirmModal
	open={!!confirmDelete}
	title={i18n.t('ADMIN_NEXT.TOOLS.BACKUPS.DELETE_BACKUP')}
	message={`Delete backup "${confirmDelete}"? This cannot be undone.`}
	confirmLabel="Delete"
	variant="destructive"
	onconfirm={handleDelete}
	oncancel={() => { confirmDelete = null; }}
/>
