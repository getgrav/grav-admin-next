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

	const promos = $derived(notifications.filter(n => n.type === 'promo'));
	const items = $derived(notifications.filter(n => n.type !== 'promo').slice(0, max));

	const ACCENT_GRADIENTS: Record<string, string> = {
		purple: 'from-purple-700 via-purple-800 to-indigo-900',
		blue: 'from-blue-700 via-blue-800 to-indigo-900',
		teal: 'from-teal-700 via-teal-800 to-emerald-900',
		amber: 'from-amber-600 via-orange-700 to-red-800',
		rose: 'from-rose-600 via-pink-700 to-fuchsia-800',
	};
	function gradientFor(accent?: string): string {
		return ACCENT_GRADIENTS[accent ?? ''] ?? ACCENT_GRADIENTS.purple;
	}
</script>

<div class="h-full rounded-lg border border-border bg-card p-4">
	<h2 class="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
		<Activity size={15} />
		{i18n.t('ADMIN_NEXT.DASHBOARD.WIDGETS.NOTIFICATIONS')}
	</h2>

	{#if promos.length === 0 && items.length === 0}
		<p class="py-4 text-center text-[13px] text-muted-foreground">{i18n.t('ADMIN_NEXT.NOTIFICATIONS_WIDGET.NO_NOTIFICATIONS')}</p>
	{:else}
		{#each promos as promo (promo.id)}
			<div class="mb-3 overflow-hidden rounded-lg bg-gradient-to-br {gradientFor(promo.accent)} p-5 text-white shadow-sm">
				{#if promo.image}
					<img src={promo.image} alt="" class="mb-3 h-7" />
				{:else if promo.title}
					<div class="mb-2 text-base font-semibold">{promo.title}</div>
				{/if}
				<p class="mb-4 text-[13px] leading-relaxed text-white/90">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html renderInlineMarkdown(promo.message)}
				</p>
				{#if promo.action}
					<a
						href={promo.action.url}
						target="_blank"
						rel="noopener noreferrer"
						class="inline-block rounded-md border border-white/40 px-3.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-white/10"
					>
						{promo.action.label}
					</a>
				{/if}
			</div>
		{/each}

		{#if items.length > 0}
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
	{/if}
</div>

{#snippet notifBody(notif: Notification)}
	{#if notif.icon}
		<span class="shrink-0 text-base leading-tight">{notif.icon}</span>
	{/if}
	<div class="min-w-0 flex-1">
		{#if notif.title}
			<div class="text-[12px] font-semibold text-foreground group-hover:text-primary">{notif.title}</div>
		{/if}
		<p class="text-[12px] leading-relaxed text-foreground/80 group-hover:text-primary">
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html renderInlineMarkdown(notif.message)}
		</p>
	</div>
	<span class="shrink-0 text-[11px] tabular-nums text-muted-foreground">{formatDate(notif.date)}</span>
{/snippet}
