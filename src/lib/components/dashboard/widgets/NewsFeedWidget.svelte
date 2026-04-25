<script lang="ts">
	import { Rss } from 'lucide-svelte';
	import { getDashboardData } from '$lib/dashboard/context';
	import { formatDate } from '$lib/dashboard/format';

	let { size = 'md' } = $props();
	const data = getDashboardData();
	const feed = $derived(data().feed);
	const max = $derived(size === 'xl' ? 16 : size === 'lg' ? 12 : size === 'md' ? 8 : 5);
</script>

<div class="h-full rounded-lg border border-border bg-card p-4">
	<h2 class="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
		<Rss size={15} />
		News Feed
	</h2>
	{#if feed.length > 0}
		<div class="space-y-2.5">
			{#each feed.slice(0, max) as item}
				<a href={item.url} target="_blank" rel="noopener noreferrer" class="group flex items-start justify-between gap-3 border-b border-border/50 pb-2 last:border-0 last:pb-0">
					<div class="min-w-0 flex-1">
						<p class="text-[12px] font-medium text-foreground group-hover:text-primary">{item.title}</p>
					</div>
					<span class="shrink-0 text-[11px] tabular-nums text-muted-foreground">{formatDate(item.date)}</span>
				</a>
			{/each}
		</div>
	{:else}
		<p class="py-4 text-center text-[13px] text-muted-foreground">No feed items</p>
	{/if}
</div>
