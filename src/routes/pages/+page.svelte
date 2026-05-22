<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { deletePage } from '$lib/api/endpoints/pages';
	import type { PageSummary } from '$lib/api/endpoints/pages';
	import { getStats, type DashboardStats } from '$lib/api/endpoints/dashboard';
	import { invalidations } from '$lib/stores/invalidation.svelte';
	import { onMount } from 'svelte';
	import { prefs, type PagesViewMode, type PagesChunkSize, PAGES_CHUNK_SIZE_OPTIONS } from '$lib/stores/preferences.svelte';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import PagesTreeView from '$lib/components/pages/PagesTreeView.svelte';
	import PagesListView from '$lib/components/pages/PagesListView.svelte';
	import PagesMillerView from '$lib/components/pages/PagesMillerView.svelte';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import { contentLang } from '$lib/stores/contentLang.svelte';
	import LanguageSwitcher from '$lib/components/ui/LanguageSwitcher.svelte';
	import {
		Plus, Search, TreePine, List, Columns3, X, ArrowUpDown, ChevronDown, FilePlus, FolderPlus, LayoutGrid
	} from 'lucide-svelte';
	import StickyHeader from '$lib/components/ui/StickyHeader.svelte';
	import { canWrite } from '$lib/utils/permissions';

	const canEditPages = $derived(canWrite('pages'));

	let searchQuery = $state('');
	let reorderMode = $state(false);
	let confirmDeleteOpen = $state(false);
	let pendingDeletePage = $state<PageSummary | null>(null);
	let stats = $state<DashboardStats['pages'] | null>(null);

	// Add dropdown (Page / Folder / Module) — inline implementation; we don't
	// yet have a shared DropdownMenu primitive, mirrors EnvironmentSwitcher.
	let addOpen = $state(false);
	function startAdd(kind: 'page' | 'folder' | 'module') {
		addOpen = false;
		goto(`${base}/pages/new?kind=${kind}`);
	}

	async function loadStats() {
		try {
			const s = await getStats();
			stats = s.pages;
		} catch { /* non-critical */ }
	}

	$effect(() => { loadStats(); });

	// Refresh stats when any page mutation happens.
	onMount(() => invalidations.subscribe('pages:*', () => loadStats()));

	// View-mode metadata. Labels are derived from i18n at render time so they
	// follow the current admin language.
	const viewModes = $derived<{ mode: PagesViewMode; icon: typeof TreePine; label: string }[]>([
		{ mode: 'tree', icon: TreePine, label: i18n.t('ADMIN_NEXT.PAGES.VIEW_TREE') },
		{ mode: 'list', icon: List, label: i18n.t('ADMIN_NEXT.PAGES.VIEW_LIST') },
		{ mode: 'miller', icon: Columns3, label: i18n.t('ADMIN_NEXT.PAGES.VIEW_COLUMNS') },
	]);

	// Stash the route the user is about to edit so that on return the list,
	// tree, or columns view can scroll its selected row back into view. Each
	// view consumes (and clears) this on mount.
	const FOCUS_KEY = 'grav_admin_pages_focus';
	function handleEdit(route: string) {
		try { sessionStorage.setItem(FOCUS_KEY, route); } catch { /* quota / disabled */ }
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
			toast.success(i18n.t('ADMIN_NEXT.TOASTS.ITEM_DELETED', { name: pg.title }));
			loadStats();
			// Child list views subscribe to `pages:*` invalidations and refetch
			// automatically when the X-Invalidates header fires — no need to force
			// a re-render by toggling viewMode.
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.PAGES.DELETE_FAILED'));
		}
	}
</script>

<svelte:head>
	<title>{i18n.t('ADMIN_NEXT.PAGES.PAGES_GRAV_ADMIN')}</title>
</svelte:head>

<div>
	<StickyHeader>
		{#snippet children({ scrolled })}
			<div class="space-y-3 px-6 transition-[padding] duration-200 {scrolled ? 'py-2' : 'pt-6 pb-3'}">
				<div class="flex items-center justify-between {scrolled ? 'min-h-6' : 'min-h-8'}">
					<div>
						<h1 class="font-semibold tracking-tight text-foreground transition-[font-size] duration-200 {scrolled ? 'text-sm' : 'text-xl'}">{i18n.t('ADMIN_NEXT.PAGES.TITLE')}</h1>
						{#if !scrolled}
							<p class="mt-0.5 text-xs text-muted-foreground">
								{#if stats}{i18n.t('ADMIN_NEXT.PAGES.PAGE_COUNT', { n: stats.total })}{:else}{i18n.t('ADMIN_NEXT.PAGES.SUBTITLE')}{/if}
							</p>
						{/if}
					</div>
					{#if canEditPages}
					<!-- Split button: primary action is "Add Page"; the chevron
						 opens a menu to add a Folder (no .md) or a Module
						 (modular sub-page). Mirrors classic admin's 3-way split. -->
					<div class="relative inline-flex">
						<Button size="sm" class="rounded-e-none" onclick={() => goto(`${base}/pages/new?kind=page`)}>
							<Plus size={14} />
							{i18n.t('ADMIN_NEXT.ADD_PAGE')}
						</Button>
						<Button
							size="sm"
							class="rounded-s-none border-s border-primary-foreground/20 px-2"
							aria-label={i18n.t('ADMIN_NEXT.PAGES.ADD_MENU')}
							onclick={() => addOpen = !addOpen}
						>
							<ChevronDown size={14} />
						</Button>

						{#if addOpen}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<div class="fixed inset-0 z-40" onclick={() => addOpen = false}></div>
							<div class="absolute end-0 z-50 mt-9 min-w-[200px] overflow-hidden rounded-md border border-border bg-popover py-1 shadow-md">
								<button
									type="button"
									class="flex w-full items-center gap-2 px-3 py-1.5 text-start text-sm text-popover-foreground transition-colors hover:bg-accent/50"
									onclick={() => startAdd('page')}
								>
									<FilePlus size={14} class="shrink-0 text-muted-foreground" />
									<span>{i18n.t('ADMIN_NEXT.PAGES.ADD_PAGE')}</span>
								</button>
								<button
									type="button"
									class="flex w-full items-center gap-2 px-3 py-1.5 text-start text-sm text-popover-foreground transition-colors hover:bg-accent/50"
									onclick={() => startAdd('folder')}
								>
									<FolderPlus size={14} class="shrink-0 text-muted-foreground" />
									<span>{i18n.t('ADMIN_NEXT.PAGES.ADD_FOLDER')}</span>
								</button>
								<button
									type="button"
									class="flex w-full items-center gap-2 px-3 py-1.5 text-start text-sm text-popover-foreground transition-colors hover:bg-accent/50"
									onclick={() => startAdd('module')}
								>
									<LayoutGrid size={14} class="shrink-0 text-muted-foreground" />
									<span>{i18n.t('ADMIN_NEXT.PAGES.ADD_MODULE')}</span>
								</button>
							</div>
						{/if}
					</div>
					{/if}
				</div>

				<!-- Toolbar -->
				<div class="group flex items-center gap-3">
		<!-- Search (expands to full row when focused on small screens) -->
		<div class="relative min-w-0 flex-1 transition-[max-width] duration-150 max-sm:group-has-[input:focus]:max-w-none" style="max-width: 320px;">
			<Search size={14} class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
			<input
				type="text"
				class="flex h-9 w-full rounded-md border border-input bg-transparent ps-9 pe-8 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
				placeholder={i18n.t('ADMIN_NEXT.PAGES.SEARCH_PLACEHOLDER')}
				bind:value={searchQuery}
			/>
			{#if searchQuery}
				<button
					class="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground"
					onclick={() => searchQuery = ''}
					aria-label={i18n.t('ADMIN_NEXT.CLEAR_SEARCH')}
				>
					<X size={14} />
				</button>
			{/if}
		</div>

		<!-- Trailing toolbar items: hide on small screens while search is focused -->
		<div class="flex flex-1 items-center gap-3 max-sm:group-has-[input:focus]:hidden">
			<div class="flex-1"></div>

			<!-- Language switcher -->
			{#if contentLang.enabled}
				<LanguageSwitcher onchange={() => { loadStats(); }} />
			{/if}

			<!-- Reorder mode toggle -->
			{#if canEditPages}
			<button
				class="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[0.75rem] font-medium transition-colors
					{reorderMode
						? 'border-primary bg-primary/10 text-primary'
						: 'border-border text-muted-foreground hover:bg-accent/50 hover:text-foreground'}"
				onclick={() => reorderMode = !reorderMode}
				title={reorderMode ? i18n.t('ADMIN_NEXT.PAGES.REORDER_EXIT_TITLE') : i18n.t('ADMIN_NEXT.PAGES.REORDER_START_TITLE')}
			>
				<ArrowUpDown size={14} />
				<span class="hidden sm:inline">{reorderMode ? i18n.t('ADMIN_NEXT.PAGES.REORDER_DONE') : i18n.t('ADMIN_NEXT.PAGES.REORDER_MOVE')}</span>
			</button>
			{/if}

			<!-- Chunk size: how many rows to fetch per request when scrolling
				 large folders. Shared across tree / list / columns. -->
			<label class="inline-flex items-center gap-1.5 text-[0.75rem] font-medium text-muted-foreground" title={i18n.t('ADMIN_NEXT.PAGES.CHUNK_SIZE_HELP')}>
				<span class="hidden md:inline">{i18n.t('ADMIN_NEXT.PAGES.CHUNK_SIZE')}</span>
				<select
					class="h-8 rounded-md border border-border bg-transparent ps-2 pe-7 py-0 text-[0.75rem] shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
					value={prefs.pagesChunkSize}
					onchange={(e) => prefs.pagesChunkSize = Number((e.target as HTMLSelectElement).value) as PagesChunkSize}
				>
					{#each PAGES_CHUNK_SIZE_OPTIONS as size}
						<option value={size}>{size}</option>
					{/each}
				</select>
			</label>

			<!-- View mode toggle -->
			<div class="inline-flex rounded-md border border-border shadow-sm">
				{#each viewModes as vm}
					<button
						class="inline-flex h-8 items-center gap-1.5 px-3 text-[0.75rem] font-medium transition-colors first:rounded-l-md last:rounded-r-md
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
			<div class="flex items-center gap-4 border-t border-border px-4 py-2 text-[0.6875rem] text-muted-foreground">
				<span>{i18n.t('ADMIN_NEXT.PAGES.STATS_TOTAL', { n: stats.total })}</span>
				<span class="text-border">|</span>
				<span>{i18n.t('ADMIN_NEXT.PAGES.STATS_PUBLISHED', { n: stats.published })}</span>
				<span class="text-border">|</span>
				<span>{i18n.t('ADMIN_NEXT.PAGES.STATS_UNPUBLISHED', { n: stats.total - stats.published })}</span>
			</div>
		{/if}
	</div>
	</div>
</div>

<ConfirmModal
	open={confirmDeleteOpen}
	title={i18n.t('ADMIN_NEXT.PAGES.DELETE_PAGE')}
	message={i18n.t('ADMIN_NEXT.CONFIRM_DELETE', { title: pendingDeletePage?.title ?? '', route: pendingDeletePage?.route ?? '' })}
	confirmLabel={i18n.t('ADMIN_NEXT.DELETE')}
	variant="destructive"
	onconfirm={confirmDelete}
	oncancel={() => { confirmDeleteOpen = false; pendingDeletePage = null; }}
/>
