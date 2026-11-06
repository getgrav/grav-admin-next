<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { Activity } from 'lucide-svelte';
	import { getDashboardData } from '$lib/dashboard/context';
	import { formatDate, renderInlineMarkdown } from '$lib/dashboard/format';
	import type { Notification } from '$lib/api/endpoints/dashboard';

	let { size = 'md' } = $props();
	const data = getDashboardData();
	const notifications = $derived(data().notifications);
	const max = $derived(size === 'xl' ? 16 : size === 'lg' ? 12 : size === 'md' ? 8 : 6);

	// Promos live in the banner under the stats row now, so this list is
	// text notifications only. The feed keeps its `dashboard` promos for
	// admins older than the banner.
	const items = $derived(notifications.filter(n => n.type !== 'promo').slice(0, max));
</script>

<div class="h-full rounded-lg border border-border bg-card p-4">
	<h2 class="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
		<Activity size={15} />
		{i18n.t('ADMIN_NEXT.DASHBOARD.WIDGETS.NOTIFICATIONS')}
	</h2>

	{#if items.length === 0}
		<p class="py-4 text-center text-[0.8125rem] text-muted-foreground">{i18n.t('ADMIN_NEXT.NOTIFICATIONS_WIDGET.NO_NOTIFICATIONS')}</p>
	{:else}
		<ul class="space-y-2.5">
			{#each items as notif (notif.id)}
				<li class="border-b border-border/50 pb-2 last:border-0 last:pb-0">
					{#if notif.link}
						<a
							href={notif.link}
							target="_blank"
							rel="noopener noreferrer"
							class="group flex items-start gap-3"
						>
							{@render notifBody(notif)}
						</a>
					{:else}
						<div class="flex items-start gap-3">
							{@render notifBody(notif)}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

{#snippet notifBody(notif: Notification)}
	{#if notif.icon}
		<span class="shrink-0 text-base leading-tight">{notif.icon}</span>
	{/if}
	<div class="min-w-0 flex-1">
		{#if notif.title}
			<div class="text-[0.75rem] font-semibold text-foreground group-hover:text-primary">{notif.title}</div>
		{/if}
		<p class="text-[0.75rem] leading-relaxed text-foreground/80 group-hover:text-primary [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-primary/80">
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html renderInlineMarkdown(notif.message)}
		</p>
	</div>
	<span class="shrink-0 text-[0.6875rem] tabular-nums text-muted-foreground">{formatDate(notif.date)}</span>
{/snippet}
