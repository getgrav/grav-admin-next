<script lang="ts">
	import StatsWidget from './widgets/StatsWidget.svelte';
	import PopularityWidget from './widgets/PopularityWidget.svelte';
	import SystemHealthWidget from './widgets/SystemHealthWidget.svelte';
	import RecentPagesWidget from './widgets/RecentPagesWidget.svelte';
	import TopPagesWidget from './widgets/TopPagesWidget.svelte';
	import BackupsWidget from './widgets/BackupsWidget.svelte';
	import NotificationsWidget from './widgets/NotificationsWidget.svelte';
	import NewsFeedWidget from './widgets/NewsFeedWidget.svelte';
	import PluginWidgetLoader from './PluginWidgetLoader.svelte';
	import type { ResolvedWidget } from '$lib/dashboard/types';

	let { widget }: { widget: ResolvedWidget } = $props();
</script>

{#if widget.id === 'core.stats'}
	<StatsWidget size={widget.size} />
{:else if widget.id === 'core.popularity'}
	<PopularityWidget size={widget.size} />
{:else if widget.id === 'core.system-health'}
	<SystemHealthWidget />
{:else if widget.id === 'core.recent-pages'}
	<RecentPagesWidget size={widget.size} />
{:else if widget.id === 'core.top-pages'}
	<TopPagesWidget size={widget.size} />
{:else if widget.id === 'core.backups'}
	<BackupsWidget size={widget.size} />
{:else if widget.id === 'core.notifications'}
	<NotificationsWidget size={widget.size} />
{:else if widget.id === 'core.news-feed'}
	<NewsFeedWidget size={widget.size} />
{:else if widget.source === 'plugin'}
	<PluginWidgetLoader {widget} />
{:else}
	<div class="rounded-lg border border-dashed border-amber-500/30 bg-amber-500/5 p-4 text-center text-[12px] text-amber-600 dark:text-amber-400">
		Unknown widget: {widget.id}
	</div>
{/if}
