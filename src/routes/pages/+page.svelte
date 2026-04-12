<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { deletePage } from '$lib/api/endpoints/pages';
	import type { PageSummary } from '$lib/api/endpoints/pages';
	import { getStats, type DashboardStats } from '$lib/api/endpoints/dashboard';
	import { invalidations } from '$lib/stores/invalidation.svelte';
	import { onMount } from 'svelte';
	import { prefs, type PagesViewMode } from '$lib/stores/preferences.svelte';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import PagesTreeView from '$lib/components/pages/PagesTreeView.svelte';
	import PagesListView from '$lib/components/pages/PagesListView.svelte';
	import PagesMillerView from '$lib/components/pages/PagesMillerView.svelte';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import { contentLang } from '$lib/stores/contentLang.svelte';
	import LanguageSwitcher from '$lib/components/ui/LanguageSwitcher.svelte';
	import {
		Plus, Search, TreePine, List, Columns3, X, ArrowUpDown
	} from 'lucide-svelte';
	import StickyHeader from '$lib/components/ui/StickyHeader.svelte';
	import { canWrite } from '$lib/utils/permissions';

	const canEditPages = $derived(canWrite('pages'));

	let searchQuery = $state('');
	let reorderMode = $state(false);
	let confirmDeleteOpen = $state(false);
	let pendingDeletePage = $state<PageSummary | null>(null);
	let stats = $state<DashboardStats['pages'] | null>(null);

	async function loadStats() {
		try {
			const s = await getStats();
			stats = s.pages;
		} catch { /* non-critical */ }
	}

	$effect(() => { loadStats(); });

	// Refresh stats when any page mutation happens.
	onMount(() => invalidations.subscribe('pages:*', () => loadStats()));

	const viewModes: { mode: PagesViewMode; icon: typeof TreePine; label: string }[] = [
		{ mode: 'tree', icon: TreePine, label: 'Tree' },
		{ mode: 'list', icon: List, label: 'List' },
		{ mode: 'miller', icon: Columns3, label: 'Columns' },
	];

	function handleEdit(route: string) {
		goto(`${base}/pages/edit${route}`);
	}

	function handleDelete(page: PageSummary) {
		pendingDeletePage = page;
		confirmDeleteOpen = true;
	}

	async function confirmDelete() {
		const pg = pendingDeletePage;
		confirmDeleteOpen = false;
		pendingDeletePage = null;
		if (!pg) return;
		try {
			await deletePage(pg.route, { children: true });
			toast.success(`Deleted "${pg.title}"`);
			loadStats();
			// Child list views subscribe to `pages:*` invalidations and refetch
			// automatically when the X-Invalidates header fires — no need to force
			// a re-render by toggling viewMode.
		} catch {
			toast.error('Failed to delete page');
		}
	}
</script>

<svelte:head>
	<title>Pages — Grav Admin</title>
</svelte:head>

<div>
	<StickyHeader>
		{#snippet children({ scrolled })}
			<div class="space-y-3 px-6 transition-[padding] duration-200 {scrolled ? 'py-2' : 'pt-6 pb-3'}">
				<div class="flex items-center justify-between {scrolled ? 'min-h-6' : 'min-h-8'}">
					<div>
						<h1 class="font-semibold tracking-tight text-foreground transition-[font-size] duration-200 {scrolled ? 'text-sm' : 'text-xl'}">Pages</h1>
						{#if !scrolled}
							<p class="mt-0.5 text-xs text-muted-foreground">
								{#if stats}{stats.total} page{stats.total !== 1 ? 's' : ''}{:else}Manage your site content and structure{/if}
							</p>
						{/if}
					</div>
					{#if canEditPages}
					<Button size="sm" onclick={() => goto(`${base}/pages/new`)}>
						<Plus size={14} />
						Add Page
					</Button>
					{/if}
				</div>

				<!-- Toolbar -->
				<div class="flex items-center gap-3">
		<!-- Search -->
		<div class="relative flex-1" style="max-width: 320px;">
			<Search size={14} class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
			<input
				type="text"
				class="flex h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-8 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
				placeholder="Search pages..."
				bind:value={searchQuery}
			/>
			{#if searchQuery}
				<button
					class="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground"
					onclick={() => searchQuery = ''}
					aria-label="Clear search"
				>
					<X size={14} />
				</button>
			{/if}
		</div>

		<div class="flex-1"></div>

		<!-- Language switcher -->
		{#if contentLang.enabled}
			<LanguageSwitcher onchange={() => { loadStats(); }} />
		{/if}

		<!-- Reorder mode toggle -->
		{#if canEditPages}
		<button
			class="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[12px] font-medium transition-colors
				{reorderMode
					? 'border-primary bg-primary/10 text-primary'
					: 'border-border text-muted-foreground hover:bg-accent/50 hover:text-foreground'}"
			onclick={() => reorderMode = !reorderMode}
			title={reorderMode ? 'Exit reorder mode' : 'Reorder pages'}
		>
			<ArrowUpDown size={14} />
			<span class="hidden sm:inline">{reorderMode ? 'Done' : 'Reorder / Move'}</span>
		</button>
		{/if}

		<!-- View mode toggle -->
		<div class="inline-flex rounded-md border border-border shadow-sm">
			{#each viewModes as vm}
				<button
					class="inline-flex h-8 items-center gap-1.5 px-3 text-[12px] font-medium transition-colors first:rounded-l-md last:rounded-r-md
						{prefs.pagesViewMode === vm.mode
							? 'bg-accent text-accent-foreground'
							: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}"
					onclick={() => prefs.pagesViewMode = vm.mode}
					title={vm.label}
				>
					<vm.icon size={14} />
					<span class="hidden sm:inline">{vm.label}</span>
				</button>
			{/each}
		</div>
			</div>
			</div>
		{/snippet}
	</StickyHeader>

	<div class="relative z-0 space-y-4 px-6 pb-6">
		<!-- View content -->
	<div class="overflow-hidden rounded-lg border border-border bg-card">
		{#if prefs.pagesViewMode === 'tree'}
			<PagesTreeView {searchQuery} {reorderMode} lang={contentLang.enabled ? contentLang.activeLang : undefined} onEdit={handleEdit} onDelete={canEditPages ? handleDelete : undefined} />
		{:else if prefs.pagesViewMode === 'list'}
			<PagesListView {searchQuery} {reorderMode} lang={contentLang.enabled ? contentLang.activeLang : undefined} onEdit={handleEdit} onDelete={canEditPages ? handleDelete : undefined} />
		{:else if prefs.pagesViewMode === 'miller'}
			<PagesMillerView {searchQuery} {reorderMode} lang={contentLang.enabled ? contentLang.activeLang : undefined} onEdit={handleEdit} />
		{/if}

		<!-- Footer stats -->
		{#if stats}
			<div class="flex items-center gap-4 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
				<span>{stats.total} total</span>
				<span class="text-border">|</span>
				<span>{stats.published} published</span>
				<span class="text-border">|</span>
				<span>{stats.total - stats.published} unpublished</span>
			</div>
		{/if}
	</div>
	</div>
</div>

<ConfirmModal
	open={confirmDeleteOpen}
	title="Delete Page"
	message={`Delete "${pendingDeletePage?.title}" at ${pendingDeletePage?.route}?`}
	confirmLabel="Delete"
	variant="destructive"
	onconfirm={confirmDelete}
	oncancel={() => { confirmDeleteOpen = false; pendingDeletePage = null; }}
/>
