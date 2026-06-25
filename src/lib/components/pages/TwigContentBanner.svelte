<script lang="ts">
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { getTwigContentPageStatus, type TwigContentPageStatus } from '$lib/api/endpoints/tools';
	import { Button } from '$lib/components/ui/button';
	import { AlertTriangle, X } from 'lucide-svelte';

	let { route }: { route: string } = $props();

	let status = $state<TwigContentPageStatus | null>(null);
	let dismissed = $state(false);

	// Refetch whenever the edited route changes.
	$effect(() => {
		const current = route;
		dismissed = false;
		status = null;
		if (!current) return;
		getTwigContentPageStatus(current)
			.then((s) => {
				// Ignore a late response for a route we've since navigated away from.
				if (current === route) status = s;
			})
			.catch(() => {
				// Diagnostics are best-effort; a failed fetch just hides the banner.
			});
	});

	const hasLeak = $derived(!!status?.leak);
	const eventCount = $derived(status?.events?.length ?? 0);
	const show = $derived(!dismissed && (hasLeak || eventCount > 0));

	function openReport() {
		goto(`${base}/tools#reports`);
	}
</script>

{#if show && status}
	<div
		class="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300"
		role="status"
	>
		<AlertTriangle size={16} class="mt-0.5 shrink-0" />
		<div class="min-w-0 flex-1 space-y-1">
			{#if hasLeak}
				<p class="font-medium">
					{status.leak!.reason === 'gate_off'
						? i18n.t('ADMIN_NEXT.PAGES.TWIG_BANNER.LEAK_GATE_OFF')
						: i18n.t('ADMIN_NEXT.PAGES.TWIG_BANNER.LEAK_PAGE_OFF')}
				</p>
			{/if}
			{#if eventCount > 0}
				<p class={hasLeak ? 'text-xs' : 'font-medium'}>
					{i18n.t('ADMIN_NEXT.PAGES.TWIG_BANNER.RECENT_BLOCKS', { n: eventCount })}
				</p>
			{/if}
		</div>
		<div class="flex shrink-0 items-center gap-1">
			<Button variant="ghost" size="sm" class="h-7" onclick={openReport}>
				{i18n.t('ADMIN_NEXT.PAGES.TWIG_BANNER.VIEW_REPORT')}
			</Button>
			<button
				type="button"
				class="rounded p-1 text-amber-700/70 hover:text-amber-900 dark:text-amber-400/70 dark:hover:text-amber-200"
				aria-label={i18n.t('ADMIN_NEXT.DISMISS')}
				onclick={() => (dismissed = true)}
			>
				<X size={14} />
			</button>
		</div>
	</div>
{/if}
