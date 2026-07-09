<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { SlidersHorizontal, X } from 'lucide-svelte';
	import SegmentedToggle from '$lib/components/ui/SegmentedToggle.svelte';
	import type { PageType } from '$lib/api/endpoints/blueprints';
	import { type PageFilters, type TriState, pageFilterCount, emptyPageFilters } from '$lib/utils/pageFilters';

	interface Props {
		filters: PageFilters;
		onchange: (f: PageFilters) => void;
		templates: PageType[];
	}

	let { filters, onchange, templates }: Props = $props();

	let open = $state(false);

	const activeCount = $derived(pageFilterCount(filters));

	// Tri-state options are rebuilt on render so the labels follow the admin
	// language.
	const triOptions = $derived<{ value: TriState; label: string }[]>([
		{ value: 'all', label: i18n.t('ADMIN_NEXT.PAGES.FILTER.ALL') },
		{ value: 'yes', label: i18n.t('ADMIN_NEXT.PAGES.FILTER.YES') },
		{ value: 'no', label: i18n.t('ADMIN_NEXT.PAGES.FILTER.NO') },
	]);

	function setAxis(axis: 'published' | 'visible' | 'routable', value: TriState) {
		onchange({ ...filters, [axis]: value });
	}

	function setTemplate(value: string) {
		onchange({ ...filters, template: value });
	}

	function clearAll() {
		onchange(emptyPageFilters());
	}
</script>

<div class="relative inline-flex">
	<button
		type="button"
		class="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[0.75rem] font-medium transition-colors
			{activeCount > 0
				? 'border-primary bg-primary/10 text-primary'
				: 'border-border text-muted-foreground hover:bg-accent/50 hover:text-foreground'}"
		onclick={() => (open = !open)}
		title={i18n.t('ADMIN_NEXT.PAGES.FILTER.TITLE')}
		aria-expanded={open}
	>
		<SlidersHorizontal size={14} />
		<span class="hidden sm:inline">{i18n.t('ADMIN_NEXT.PAGES.FILTER.BUTTON')}</span>
		{#if activeCount > 0}
			<span class="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] font-semibold text-primary-foreground">
				{activeCount}
			</span>
		{/if}
	</button>

	{#if open}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="fixed inset-0 z-40" onclick={() => (open = false)}></div>
		<div class="absolute end-0 z-50 mt-9 w-72 overflow-hidden rounded-md border border-border bg-popover p-3 shadow-md">
			<div class="mb-2 flex items-center justify-between">
				<span class="text-[0.75rem] font-semibold text-popover-foreground">{i18n.t('ADMIN_NEXT.PAGES.FILTER.TITLE')}</span>
				{#if activeCount > 0}
					<button
						type="button"
						class="inline-flex items-center gap-1 rounded text-[0.6875rem] text-muted-foreground transition-colors hover:text-foreground"
						onclick={clearAll}
					>
						<X size={12} />
						{i18n.t('ADMIN_NEXT.PAGES.FILTER.CLEAR')}
					</button>
				{/if}
			</div>

			<div class="space-y-3">
				<div class="space-y-1">
					<span class="text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">{i18n.t('ADMIN_NEXT.PAGES.FILTER.PUBLISHED')}</span>
					<SegmentedToggle options={triOptions} value={filters.published} onchange={(v) => setAxis('published', v)} />
				</div>

				<div class="space-y-1">
					<span class="text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">{i18n.t('ADMIN_NEXT.PAGES.FILTER.VISIBLE')}</span>
					<SegmentedToggle options={triOptions} value={filters.visible} onchange={(v) => setAxis('visible', v)} />
				</div>

				<div class="space-y-1">
					<span class="text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">{i18n.t('ADMIN_NEXT.PAGES.FILTER.ROUTABLE')}</span>
					<SegmentedToggle options={triOptions} value={filters.routable} onchange={(v) => setAxis('routable', v)} />
				</div>

				<div class="space-y-1">
					<span class="text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">{i18n.t('ADMIN_NEXT.PAGES.FILTER.TEMPLATE')}</span>
					<select
						class="h-8 w-full rounded-md border border-border bg-transparent ps-2 pe-7 py-0 text-[0.75rem] shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
						value={filters.template}
						onchange={(e) => setTemplate((e.target as HTMLSelectElement).value)}
					>
						<option value="">{i18n.t('ADMIN_NEXT.PAGES.FILTER.ALL_TEMPLATES')}</option>
						{#each templates as t (t.type)}
							<option value={t.type}>{t.label || t.type}</option>
						{/each}
					</select>
				</div>
			</div>
		</div>
	{/if}
</div>
