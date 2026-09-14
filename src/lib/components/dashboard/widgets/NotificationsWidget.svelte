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

	// Promos come in rows. A `full` promo (the default) is a row of its own;
	// consecutive `half` promos share a row with a gap between them, and
	// consecutive `joined` promos share a row as one banner divided by a
	// hairline. Both stack when the widget is narrow, so the grouping is by
	// layout and the columns are the container's decision.
	type PromoRow = { layout: 'full' | 'half' | 'joined'; promos: Notification[] };
	function rowLayout(promo: Notification): PromoRow['layout'] {
		return promo.layout === 'half' || promo.layout === 'joined' ? promo.layout : 'full';
	}
	const promoRows = $derived.by(() => {
		const rows: PromoRow[] = [];
		for (const promo of promos) {
			const layout = rowLayout(promo);
			const last = rows[rows.length - 1];
			if (layout !== 'full' && last && last.layout === layout) {
				last.promos.push(promo);
			} else {
				rows.push({ layout, promos: [promo] });
			}
		}
		return rows;
	});
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

	// A logo is drawn 28px tall unless the feed says otherwise. A tall mark
	// (a van beside a name) reads smaller than a wide one at the same height,
	// so the feed can ask for more, within a band that keeps the row tidy.
	function imageHeight(promo: Notification): number {
		const h = Number(promo.image_height);
		return Number.isFinite(h) && h > 0 ? Math.min(48, Math.max(20, Math.round(h))) : 28;
	}
</script>

<div class="h-full rounded-lg border border-border bg-card p-4">
	<h2 class="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
		<Activity size={15} />
		{i18n.t('ADMIN_NEXT.DASHBOARD.WIDGETS.NOTIFICATIONS')}
	</h2>

	{#if promos.length === 0 && items.length === 0}
		<p class="py-4 text-center text-[0.8125rem] text-muted-foreground">{i18n.t('ADMIN_NEXT.NOTIFICATIONS_WIDGET.NO_NOTIFICATIONS')}</p>
	{:else}
		{#each promoRows as row, r (r)}
			{#if row.layout === 'full'}
				{#each row.promos as promo (promo.id)}
					<div class="mb-3 overflow-hidden rounded-lg bg-gradient-to-br {gradientFor(promo.accent)} p-5 text-white shadow-sm">
						{@render promoBody(promo)}
					</div>
				{/each}
			{:else}
				<div class="@container mb-3">
					<div
						class="grid grid-cols-1 @xl:grid-cols-2 {row.layout === 'joined'
							? 'overflow-hidden rounded-lg shadow-sm'
							: 'gap-3'}"
					>
						{#each row.promos as promo, i (promo.id)}
							<div
								class="bg-gradient-to-br {gradientFor(promo.accent)} p-5 text-white {row.layout === 'joined'
									? 'shadow-none'
									: 'overflow-hidden rounded-lg shadow-sm'} {row.layout === 'joined' && i > 0
									? 'border-t border-white/20 @xl:border-t-0 @xl:border-l'
									: ''} {i === row.promos.length - 1 && i % 2 === 0 ? '@xl:col-span-2' : ''}"
							>
								{@render promoBody(promo)}
							</div>
						{/each}
					</div>
				</div>
			{/if}
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
			<div class="text-[0.75rem] font-semibold text-foreground group-hover:text-primary">{notif.title}</div>
		{/if}
		<p class="text-[0.75rem] leading-relaxed text-foreground/80 group-hover:text-primary [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-primary/80">
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html renderInlineMarkdown(notif.message)}
		</p>
	</div>
	<span class="shrink-0 text-[0.6875rem] tabular-nums text-muted-foreground">{formatDate(notif.date)}</span>
{/snippet}

{#snippet promoBody(promo: Notification)}
	{#if promo.image}
		<img src={promo.image} alt="" class="mb-3 w-auto" style="height: {imageHeight(promo)}px" />
	{:else if promo.title}
		<div class="mb-2 text-base font-semibold">{promo.title}</div>
	{/if}
	<p class="mb-4 text-[0.8125rem] leading-relaxed text-white/90 [&_a]:font-medium [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-white">
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html renderInlineMarkdown(promo.message)}
	</p>
	{#if promo.action}
		<a
			href={promo.action.url}
			target="_blank"
			rel="noopener noreferrer"
			class="inline-block rounded-md border border-white/40 px-3.5 py-1.5 text-[0.75rem] font-semibold text-white transition-colors hover:bg-white/10"
		>
			{promo.action.label}
		</a>
	{/if}
{/snippet}
