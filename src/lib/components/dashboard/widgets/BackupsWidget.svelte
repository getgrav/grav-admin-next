<script lang="ts">
	import { Archive, Download } from 'lucide-svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import { getDashboardData } from '$lib/dashboard/context';
	import { formatDate, formatBytes } from '$lib/dashboard/format';

	let { size = 'sm' } = $props();
	const data = getDashboardData();
	const backups = $derived(data().backups);
	const max = $derived(size === 'md' ? 8 : 5);
</script>

<div class="h-full rounded-lg border border-border bg-card p-4">
	<h2 class="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
		<Archive size={15} />
		Backups
	</h2>
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
						title="Download {backup.filename}" target="_blank">
						<Download size={14} />
					</a>
				</div>
			{/each}
		</div>
	{:else}
		<p class="py-4 text-center text-[13px] text-muted-foreground">No backups found</p>
	{/if}
</div>
