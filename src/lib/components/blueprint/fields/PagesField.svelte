<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { getChildren, pageApiRoute, isAncestorOnly } from '$lib/api/endpoints/pages';
	import type { PageSummary } from '$lib/api/endpoints/pages';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { createPageSearch } from '$lib/utils/page-search.svelte';
	import { pagesFieldScope, isListedPage, canExpandAt, isInScope } from '$lib/utils/pages-field';
	import {
		ChevronDown, File, Folder, FolderOpen,
		Loader2, Search, X, ChevronsUpDown, Check, Lock
	} from 'lucide-svelte';
	import DirectionalIcon from '$lib/components/ui/DirectionalIcon.svelte';
	import FieldHelp from '../FieldHelp.svelte';

	interface Props {
		field: BlueprintField;
		value: unknown;
		onchange: (value: unknown) => void;
	}

	let { field, value, onchange }: Props = $props();
	const translateLabel = i18n.tMaybe;

	let open = $state(false);
	let filter = $state('');
	let rootPages = $state<PageSummary[]>([]);
	let childrenCache = $state<Record<string, PageSummary[]>>({});
	let expandedRoutes = $state<Set<string>>(new Set());
	let loadingRoutes = $state<Set<string>>(new Set());
	let rootLoading = $state(false);
	let filterInputEl = $state<HTMLInputElement | null>(null);

	// start_route / show_all / show_modular / limit_levels, as classic reads them.
	const fieldScope = pagesFieldScope(field);
	// Classic lists the whole site when start_route doesn't point at a page
	// (Module Reuse ships with `root: /root`), so an empty start falls back to it.
	let startFallback = $state(false);
	const scope = $derived(startFallback ? { ...fieldScope, start: '/' } : fieldScope);
	// `parents` is the parent-picker field type — root is always a valid
	// parent there, so default show_root to true when the blueprint doesn't
	// say otherwise. Plain `pages` fields (where the chosen value is a
	// content reference, not a structural parent) keep the existing
	// false default unless the blueprint opts in.
	const showRoot = field.show_root ?? (field.type === 'parents');
	const showSlug = field.show_slug ?? true;
	const showFullpath = field.show_fullpath === true;

	const selectedRoute = $derived(typeof value === 'string' ? value : '');

	// Address every page by its *structural* route (raw_route), never its public
	// one. With `system.home.alias: /blog` the blog page's route() is `/` while
	// its rawRoute() is `/blog`, so picking it off the public route would store
	// `/` — and a page saved with that parent gets moved to the pages root
	// (getgrav/grav-plugin-admin2#143, #18). The same value also has to be used
	// for expansion/caching keys, or expanding the aliased page would ask the API
	// for the children of `/` and list the top-level pages under itself.

	// Find the display label for a selected page. `seen` keeps the walk from
	// re-entering a list it is already inside: if a row's route ever matches a
	// cache key that holds one of its own ancestors — as the home page's public
	// `/` did against the root list before we switched to raw_route — the walk
	// would otherwise recurse until the stack blew, and the "too much recursion"
	// exception would kill the click handler mid-selection
	// (getgrav/grav-plugin-admin2#145).
	function findPageTitle(pages: PageSummary[], route: string, seen = new Set<string>()): string | null {
		for (const p of pages) {
			const apiRoute = pageApiRoute(p);
			if (apiRoute === route) return p.title;
			if (seen.has(apiRoute)) continue;
			seen.add(apiRoute);
			const cached = childrenCache[apiRoute];
			if (cached) {
				const found = findPageTitle(cached, route, seen);
				if (found) return found;
			}
		}
		return null;
	}

	// Title of a page picked from search results, which may sit in a folder
	// the tree never loaded, so findPageTitle() can't see it.
	let pickedTitle = $state<{ route: string; title: string } | null>(null);

	const selectedLabel = $derived(() => {
		if (!selectedRoute) return '';
		const title = findPageTitle(rootPages, selectedRoute)
			?? (pickedTitle?.route === selectedRoute ? pickedTitle.title : null);
		if (title && !showFullpath) return showSlug ? `${selectedRoute} — ${title}` : title;
		return selectedRoute;
	});

	async function loadRoot() {
		if (rootPages.length > 0) return;
		rootLoading = true;
		try {
			rootPages = await getChildren(scope.start, 'title', 'asc', undefined, undefined, { summary: true });
			if (rootPages.length === 0 && scope.start !== '/') {
				startFallback = true;
				rootPages = await getChildren('/', 'title', 'asc', undefined, undefined, { summary: true });
			}
			childrenCache = { [scope.start]: rootPages };
		} catch { /* handled */ }
		finally { rootLoading = false; }
	}

	async function loadChildren(route: string) {
		if (childrenCache[route]) return;
		loadingRoutes = new Set([...loadingRoutes, route]);
		try {
			const children = await getChildren(route, 'title', 'asc', undefined, undefined, { summary: true });
			childrenCache = { ...childrenCache, [route]: children };
		} catch {
			childrenCache = { ...childrenCache, [route]: [] };
		} finally {
			const next = new Set(loadingRoutes);
			next.delete(route);
			loadingRoutes = next;
		}
	}

	async function toggleExpand(route: string, e: Event) {
		e.stopPropagation();
		const next = new Set(expandedRoutes);
		if (next.has(route)) {
			next.delete(route);
		} else {
			next.add(route);
			await loadChildren(route);
		}
		expandedRoutes = next;
	}

	function selectPage(route: string) {
		onchange(route);
		open = false;
		filter = '';
	}

	function handleOpen() {
		open = !open;
		if (open) {
			loadRoot();
			// Focus filter input after open
			requestAnimationFrame(() => filterInputEl?.focus());
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			open = false;
			filter = '';
		}
	}

	function handleClickOutside(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (!target.closest('.pages-field-popover')) {
			open = false;
			filter = '';
		}
	}

	// Typing searches the whole site through the API, as the Pages tree, list
	// and columns do. Filtering the loaded tree only ever found top-level pages:
	// a child was hidden unless its folder was open AND matched the text too
	// (grav-admin-next#50). `editable: false` keeps search in step with the
	// tree, which lists every page the user can read.
	const search = createPageSearch({ debounceMs: 200, editable: false });
	const searching = $derived(filter.trim().length > 0);
	const searchResults = $derived(
		search.results.filter((p) => shouldShow(p) && !isAncestorOnly(p) && isInScope(pageApiRoute(p), scope))
	);
	$effect(() => {
		search.run(filter);
	});
	$effect(() => () => search.dispose());

	function selectSearchResult(page: PageSummary) {
		pickedTitle = { route: pageApiRoute(page), title: page.title };
		selectPage(pageApiRoute(page));
	}

	function shouldShow(page: PageSummary): boolean {
		return isListedPage(page, scope);
	}

	$effect(() => {
		if (open) {
			document.addEventListener('mousedown', handleClickOutside);
			return () => document.removeEventListener('mousedown', handleClickOutside);
		}
	});
</script>

<div class="space-y-2">
	{#if field.label || field.help}
		<div>
			{#if field.label}
				<label class="text-sm font-semibold text-foreground">
					{translateLabel(field.label)}
					{#if field.validate?.required}
						<span class="text-red-500">*</span>
					{/if}
				</label>
			{/if}
			<FieldHelp help={field.help} label={field.label} />
		</div>
	{/if}

	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="pages-field-popover relative" onkeydown={handleKeydown}>
		<!-- Trigger button -->
		<button
			type="button"
			class="flex h-10 w-full items-center justify-between rounded-lg border border-input bg-muted/50 px-3 py-2 text-sm shadow-sm transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
			onclick={handleOpen}
		>
			<span class={selectedRoute ? 'text-foreground' : 'text-muted-foreground'}>
				{selectedRoute ? selectedLabel() : i18n.t('ADMIN_NEXT.FIELDS.SELECT_A_PAGE')}
			</span>
			<ChevronsUpDown size={14} class="shrink-0 text-muted-foreground" />
		</button>

		<!-- Popover dropdown -->
		{#if open}
			<div class="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
				<!-- Search filter -->
				<div class="flex items-center gap-2 border-b border-border px-3 py-2">
					<Search size={14} class="shrink-0 text-muted-foreground" />
					<input
						bind:this={filterInputEl}
						type="text"
						class="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
						placeholder={i18n.t('ADMIN_NEXT.FIELDS.PAGES.FILTER_PAGES')}
						bind:value={filter}
					/>
					{#if filter}
						<button
							type="button"
							class="shrink-0 text-muted-foreground hover:text-foreground"
							onclick={() => { filter = ''; filterInputEl?.focus(); }}
						>
							<X size={14} />
						</button>
					{/if}
				</div>

				<!-- Tree content -->
				<div class="max-h-72 overflow-y-auto p-1">
					{#if searching}
						{#if search.loading}
							<div class="flex items-center justify-center py-6 text-sm text-muted-foreground">
								<Loader2 size={16} class="me-2 animate-spin" />
								{i18n.t('ADMIN_NEXT.PAGES.PAGES_TREE_VIEW.SEARCHING')}
							</div>
						{:else if searchResults.length === 0}
							<div class="py-4 text-center text-sm text-muted-foreground">
								{i18n.t('ADMIN_NEXT.PAGES.NO_PAGES')}
							</div>
						{:else}
							{#each searchResults as page (pageApiRoute(page))}
								{@const apiRoute = pageApiRoute(page)}
								<button
									type="button"
									class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-sm transition-colors
										{selectedRoute === apiRoute ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-accent'}"
									onclick={() => selectSearchResult(page)}
								>
									<File size={14} class="shrink-0 text-muted-foreground" />
									<span class="min-w-0 truncate">
										{#if showFullpath}
											{page.route}
										{:else}
											{page.title}
											<span class="text-muted-foreground">{apiRoute}</span>
										{/if}
									</span>
									{#if selectedRoute === apiRoute}
										<Check size={14} class="ms-auto shrink-0 text-primary" />
									{/if}
								</button>
							{/each}
							{#if search.hasMore}
								<button
									type="button"
									class="w-full px-2 py-1.5 text-start text-xs font-medium text-primary hover:underline disabled:opacity-50"
									disabled={search.loadingMore}
									onclick={() => search.more()}
								>
									{i18n.t('ADMIN_NEXT.PAGES.SEARCH_SHOW_MORE')}
								</button>
							{/if}
						{/if}
					{:else if rootLoading}
						<div class="flex items-center justify-center py-6 text-sm text-muted-foreground">
							<Loader2 size={16} class="me-2 animate-spin" />
							{i18n.t('ADMIN_NEXT.PAGES.LOADING')}
						</div>
					{:else}
						{#if showRoot}
							<button
								type="button"
								class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-sm transition-colors
									{selectedRoute === '/' ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-accent'}"
								onclick={() => selectPage('/')}
							>
								<File size={14} class="shrink-0 text-muted-foreground" />
								<span class="truncate">{i18n.t('ADMIN_NEXT.FIELDS.PAGES.ROOT')}</span>
								{#if selectedRoute === '/'}
									<Check size={14} class="ms-auto shrink-0 text-primary" />
								{/if}
							</button>
						{/if}
						{#each rootPages as page (pageApiRoute(page))}
							{#if shouldShow(page)}
								{@render pageNode(page, 0)}
							{/if}
						{/each}
						{#if rootPages.length === 0}
							<div class="py-4 text-center text-sm text-muted-foreground">
								{i18n.t('ADMIN_NEXT.PAGES.NO_PAGES')}
							</div>
						{/if}
					{/if}
				</div>
			</div>
		{/if}
	</div>

</div>

{#snippet pageNode(page: PageSummary, depth: number)}
	{@const apiRoute = pageApiRoute(page)}
	{@const isExpanded = expandedRoutes.has(apiRoute)}
	{@const isLoading = loadingRoutes.has(apiRoute)}
	{@const isSelected = selectedRoute === apiRoute}
	{@const children = childrenCache[apiRoute]}
	{@const filtered = children ? children.filter(shouldShow) : []}
	<!-- A page the user can't read is listed only as a way to the pages inside
	     it (admin2#209): picking it opens it instead of choosing it. -->
	{@const passThrough = isAncestorOnly(page)}
	{@const expandable = page.has_children && canExpandAt(depth, scope)}

	<div style="padding-left: {depth * 16}px">
		<button
			type="button"
			class="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-start text-sm transition-colors
				{isSelected ? 'bg-primary/10 text-primary' : passThrough ? 'text-muted-foreground hover:bg-accent/50' : 'text-foreground hover:bg-accent'}"
			title={passThrough ? i18n.t('ADMIN_NEXT.PAGES.ANCESTOR_ONLY_HINT') : undefined}
			onclick={(e) => { if (!passThrough) selectPage(apiRoute); else if (expandable) toggleExpand(apiRoute, e); }}
		>
			<!-- Expand toggle -->
			{#if expandable}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<span
					class="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
					onclick={(e) => toggleExpand(apiRoute, e)}
					role="button"
					tabindex="-1"
				>
					{#if isLoading}
						<Loader2 size={12} class="animate-spin" />
					{:else if isExpanded}
						<ChevronDown size={12} />
					{:else}
						<DirectionalIcon name="chevron-forward" size={12} />
					{/if}
				</span>
			{:else}
				<span class="w-5 shrink-0"></span>
			{/if}

			<!-- Icon -->
			{#if page.has_children}
				{#if isExpanded}
					<FolderOpen size={14} class="shrink-0 text-muted-foreground" />
				{:else}
					<Folder size={14} class="shrink-0 text-muted-foreground" />
				{/if}
			{:else}
				<File size={14} class="shrink-0 text-muted-foreground" />
			{/if}

			<!-- Label -->
			<span class="min-w-0 truncate">
				{#if showFullpath}
					{page.route}
				{:else}
					{#if showSlug}
						<span class="text-muted-foreground">({page.slug})</span>
					{/if}
					{page.title}
				{/if}
			</span>
			{#if passThrough}
				<Lock size={11} class="shrink-0 text-muted-foreground/70" aria-hidden="true" />
			{/if}

			{#if isSelected}
				<Check size={14} class="ms-auto shrink-0 text-primary" />
			{/if}
		</button>
	</div>

	<!-- Children -->
	{#if expandable && isExpanded && children}
		{#each filtered as child (pageApiRoute(child))}
			{@render pageNode(child, depth + 1)}
		{/each}
	{/if}
{/snippet}
