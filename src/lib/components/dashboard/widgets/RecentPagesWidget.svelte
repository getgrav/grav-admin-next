<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { base } from '$app/paths';
	import { Clock } from 'lucide-svelte';
	import { getDashboardData } from '$lib/dashboard/context';
	import { formatDate } from '$lib/dashboard/format';

	let { size = 'sm' } = $props();
	const data = getDashboardData();
	const recentPages = $derived(data().recentPages);
	const max = $derived(size === 'md' ? 8 : 6);
</script>

<div class="h-full rounded-lg border border-border bg-card p-4">
	<div class="mb-3 flex items-center justify-between">
		<h2 class="flex items-center gap-2 text-sm font-semibold text-foreground">
			<Clock size={15} />
			{i18n.t('ADMIN_NEXT.DASHBOARD.WIDGETS.RECENT_PAGES')}
		</h2>
		<a href="{base}/pages" class="text-[11px] text-primary hover:underline">{i18n.t('ADMIN_NEXT.RECENT_PAGES_WIDGET.VIEW_ALL')}</a>
	</div>
	{#if recentPages.length > 0}
		<div class="space-y-0.5">
			{#each recentPages.slice(0, max) as pg}
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
		<p class="py-6 text-center text-sm text-muted-foreground">{i18n.t('ADMIN_NEXT.PAGES.NO_PAGES')}</p>
	{/if}
</div>
