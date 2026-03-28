<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { getChildren } from '$lib/api/endpoints/pages';
	import type { PageSummary } from '$lib/api/endpoints/pages';
	import { i18n } from '$lib/stores/i18n.svelte';
	import {
		ChevronRight, ChevronDown, File, Folder, FolderOpen,
		Loader2, Search, X, ChevronsUpDown, Check
	} from 'lucide-svelte';

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

	const showModular = field.show_modular ?? false;
	const showRoot = field.show_root ?? false;
	const showSlug = field.show_slug ?? true;

	const selectedRoute = $derived(typeof value === 'string' ? value : '');

	// Find the display label for a selected page
	function findPageTitle(pages: PageSummary[], route: string): string | null {
		for (const p of pages) {
			if (p.route === route) return p.title;
			const cached = childrenCache[p.route];
			if (cached) {
				const found = findPageTitle(cached, route);
				if (found) return found;
			}
		}
		return null;
	}

	const selectedLabel = $derived(() => {
		if (!selectedRoute) return '';
		const title = findPageTitle(rootPages, selectedRoute);
		if (title) return showSlug ? `${selectedRoute} — ${title}` : title;
		return selectedRoute;
	});

	async function loadRoot() {
		if (rootPages.length > 0) return;
		rootLoading = true;
		try {
			rootPages = await getChildren('/', 'title', 'asc');
			childrenCache = { '/': rootPages };
		} catch { /* handled */ }
		finally { rootLoading = false; }
	}

	async function loadChildren(route: string) {
		if (childrenCache[route]) return;
		loadingRoutes = new Set([...loadingRoutes, route]);
		try {
			const children = await getChildren(route, 'title', 'asc');
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

	function filterPages(pages: PageSummary[]): PageSummary[] {
		if (!filter) return pages;
		const q = filter.toLowerCase();
		return pages.filter(p =>
			p.title.toLowerCase().includes(q) ||
			p.route.toLowerCase().includes(q) ||
			p.slug.toLowerCase().includes(q)
		);
	}

	function shouldShow(page: PageSummary): boolean {
		if (!showModular && page.template?.startsWith('modular/')) return false;
		return true;
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
			{#if field.help}
				<p class="mt-0.5 text-xs text-muted-foreground">{translateLabel(field.help)}</p>
			{/if}
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
				{selectedRoute ? selectedLabel() : 'Select a page...'}
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
						placeholder="Filter pages..."
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
					{#if rootLoading}
						<div class="flex items-center justify-center py-6 text-sm text-muted-foreground">
							<Loader2 size={16} class="mr-2 animate-spin" />
							Loading pages...
						</div>
					{:else}
						{#if showRoot}
							<button
								type="button"
								class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors
									{selectedRoute === '/' ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-accent'}"
								onclick={() => selectPage('/')}
							>
								<File size={14} class="shrink-0 text-muted-foreground" />
								<span class="truncate">/ (root)</span>
								{#if selectedRoute === '/'}
									<Check size={14} class="ml-auto shrink-0 text-primary" />
								{/if}
							</button>
						{/if}
						{#each filterPages(rootPages) as page (page.route)}
							{#if shouldShow(page)}
								{@render pageNode(page, 0)}
							{/if}
						{/each}
						{#if !rootLoading && filterPages(rootPages).length === 0}
							<div class="py-4 text-center text-sm text-muted-foreground">
								No pages found
							</div>
						{/if}
					{/if}
				</div>
			</div>
		{/if}
	</div>

</div>

{#snippet pageNode(page: PageSummary, depth: number)}
	{@const isExpanded = expandedRoutes.has(page.route)}
	{@const isLoading = loadingRoutes.has(page.route)}
	{@const isSelected = selectedRoute === page.route}
	{@const children = childrenCache[page.route]}
	{@const filtered = children ? filterPages(children).filter(shouldShow) : []}

	<div style="padding-left: {depth * 16}px">
		<button
			type="button"
			class="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors
				{isSelected ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-accent'}"
			onclick={() => selectPage(page.route)}
		>
			<!-- Expand toggle -->
			{#if page.has_children}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<span
					class="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
					onclick={(e) => toggleExpand(page.route, e)}
					role="button"
					tabindex="-1"
				>
					{#if isLoading}
						<Loader2 size={12} class="animate-spin" />
					{:else if isExpanded}
						<ChevronDown size={12} />
					{:else}
						<ChevronRight size={12} />
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
				{#if showSlug}
					<span class="text-muted-foreground">({page.slug})</span>
				{/if}
				{page.title}
			</span>

			{#if isSelected}
				<Check size={14} class="ml-auto shrink-0 text-primary" />
			{/if}
		</button>
	</div>

	<!-- Children -->
	{#if isExpanded && children}
		{#each filtered as child (child.route)}
			{@render pageNode(child, depth + 1)}
		{/each}
	{/if}
{/snippet}
