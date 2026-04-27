<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { Eye } from 'lucide-svelte';
	import { getDashboardData } from '$lib/dashboard/context';

	let { size = 'sm' } = $props();
	const data = getDashboardData();
	const popularity = $derived(data().popularity);
	const animated = $derived(data().animated);
	const max = $derived(size === 'md' ? 10 : 6);
</script>

<div class="h-full rounded-lg border border-border bg-card p-4">
	<h2 class="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
		<Eye size={15} />
		{i18n.t('ADMIN_NEXT.DASHBOARD.WIDGETS.TOP_PAGES')}
	</h2>
	{#if popularity?.top_pages && popularity.top_pages.length > 0}
		{@const maxViews = popularity.top_pages[0].views}
		<div class="space-y-2">
			{#each popularity.top_pages.slice(0, max) as page}
				<div class="group">
					<div class="flex items-center justify-between text-[12px]">
						<span class="min-w-0 flex-1 truncate font-medium text-foreground">{page.route}</span>
						<span class="ml-2 shrink-0 tabular-nums text-muted-foreground">{page.views}</span>
					</div>
					<div class="mt-1 h-1 overflow-hidden rounded-full bg-secondary">
						<div class="h-full rounded-full bg-primary/60"
							style="width: {animated ? (page.views / maxViews) * 100 : 0}%; transition: width 0.8s cubic-bezier(0.16,1,0.3,1);"></div>
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<p class="py-4 text-center text-[13px] text-muted-foreground">{i18n.t('ADMIN_NEXT.TOP_PAGES_WIDGET.NO_VIEW_DATA_YET')}</p>
	{/if}
</div>
