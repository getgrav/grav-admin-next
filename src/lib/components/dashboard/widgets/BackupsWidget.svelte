<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { Archive, Download, Plus, Loader2 } from 'lucide-svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import { getDashboardData } from '$lib/dashboard/context';
	import { formatDate, formatBytes } from '$lib/dashboard/format';

	let { size = 'sm' } = $props();
	const data = getDashboardData();
	const backups = $derived(data().backups);
	const max = $derived(size === 'md' ? 8 : 5);
</script>

<div class="h-full rounded-lg border border-border bg-card p-4">
	<div class="mb-3 flex items-center justify-between gap-2">
		<h2 class="flex items-center gap-2 text-sm font-semibold text-foreground">
			<Archive size={15} />
			{i18n.t('ADMIN_NEXT.DASHBOARD.WIDGETS.BACKUPS')}
		</h2>
		{#if data().canWriteSystem}
			<button
				type="button"
				class="inline-flex h-6 items-center gap-1 rounded-md bg-primary px-2 text-[11px] font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
				onclick={() => data().onCreateBackup()}
				disabled={data().creatingBackup}
				title={i18n.t('ADMIN_NEXT.BACKUPS_WIDGET.CREATE_A_NEW_BACKUP_NOW')}
			>
				{#if data().creatingBackup}
					<Loader2 size={11} class="animate-spin" />
					{i18n.t('ADMIN_NEXT.BACKUPS_WIDGET.BACKING_UP')}
				{:else}
					<Plus size={11} />
					{i18n.t('ADMIN_NEXT.BACKUPS_WIDGET.BACKUP_NOW')}
				{/if}
			</button>
		{/if}
	</div>
	{#if backups.length > 0}
		<div class="-mx-4 divide-y divide-border">
			{#each backups.slice(0, max) as backup}
				<div class="flex items-center gap-3 px-4 py-2">
					<div class="min-w-0 flex-1">
						<div class="text-[12px] font-medium text-foreground">{formatDate(backup.date)}</div>
						<div class="text-[11px] text-muted-foreground">{formatBytes(backup.size)}</div>
					</div>
					<a href="{auth.serverUrl}{auth.apiPrefix}/system/backups/{encodeURIComponent(backup.filename)}/download?token={auth.accessToken}"
						class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						title={i18n.t('ADMIN_NEXT.BACKUPS_WIDGET.DOWNLOAD_FILE', { filename: backup.filename })} target="_blank">
						<Download size={14} />
					</a>
				</div>
			{/each}
		</div>
	{:else}
		<p class="py-4 text-center text-[13px] text-muted-foreground">{i18n.t('ADMIN_NEXT.BACKUPS_WIDGET.NO_BACKUPS_FOUND')}</p>
	{/if}
</div>
