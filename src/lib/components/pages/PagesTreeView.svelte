<script lang="ts">
	import { getChildren, reorganizePages } from '$lib/api/endpoints/pages';
	import type { PageSummary, ReorganizeOperation } from '$lib/api/endpoints/pages';
	import { invalidations } from '$lib/stores/invalidation.svelte';
	import { onMount } from 'svelte';
	import { Badge } from '$lib/components/ui/badge';
	import TranslationBadges from '$lib/components/ui/TranslationBadges.svelte';
	import { toast } from 'svelte-sonner';
	import {
		ChevronRight, ChevronDown, FolderOpen, Folder, File, Loader2, Trash2,
		ArrowUp, ArrowDown, GripVertical
	} from 'lucide-svelte';

	type SortField = 'default' | 'order' | 'title' | 'modified' | 'date' | 'slug';

	interface Props {
		searchQuery?: string;
		reorderMode?: boolean;
		lang?: string;
		onEdit: (route: string) => void;
		onDelete: (page: PageSummary) => void;
	}

	let { searchQuery = '', reorderMode = false, lang, onEdit, onDelete }: Props = $props();

	let childrenCache = $state<Record<string, PageSummary[]>>({});
	let loadingRoutes = $state<Set<string>>(new Set());
	let expandedRoutes = $state<Set<string>>(new Set(['/']));
	let rootPages = $state<PageSummary[]>([]);
	let rootLoading = $state(true);
	let sortField = $state<SortField>('default');
	let sortOrder = $state<'asc' | 'desc'>('asc');

	// Drag-and-drop state
	let dragPage = $state<PageSummary | null>(null);
	let dragParentRoute = $state<string | null>(null);
	let dropTarget = $state<{ parentRoute: string; index: number } | null>(null);
	let saving = $state(false);

	function toggleSort(field: SortField) {
		if (sortField === field) {
			sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
		} else {
			sortField = field;
			sortOrder = field === 'modified' || field === 'date' ? 'desc' : 'asc';
		}
		childrenCache = {};
		loadRoot();
	}

	async function loadRoot() {
		rootLoading = true;
		try {
			rootPages = await getChildren('/', sortField, sortOrder, lang, !!lang);
			childrenCache = { '/': rootPages };
		} catch { /* handled */ }
		finally { rootLoading = false; }
	}

	async function loadChildren(parentRoute: string) {
		if (childrenCache[parentRoute]) return;
		loadingRoutes = new Set([...loadingRoutes, parentRoute]);
		try {
			const children = await getChildren(parentRoute, sortField, sortOrder, lang, !!lang);
			childrenCache = { ...childrenCache, [parentRoute]: children };
		} catch {
			childrenCache = { ...childrenCache, [parentRoute]: [] };
		} finally {
			const next = new Set(loadingRoutes);
			next.delete(parentRoute);
			loadingRoutes = next;
		}
	}

	async function toggleExpand(route: string) {
		const next = new Set(expandedRoutes);
		if (next.has(route)) {
			next.delete(route);
		} else {
			next.add(route);
			await loadChildren(route);
		}
		expandedRoutes = next;
	}

	function formatDate(dateStr: string): string {
		const date = new Date(dateStr);
		const now = new Date();
		const diff = now.getTime() - date.getTime();
		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);
		if (minutes < 1) return 'just now';
		if (minutes < 60) return `${minutes}m ago`;
		if (hours < 24) return `${hours}h ago`;
		if (days < 7) return `${days}d ago`;
		return date.toLocaleDateString();
	}

	let prevLang = lang;
	$effect(() => {
		if (lang !== prevLang) {
			prevLang = lang;
			childrenCache = {};
		}
		loadRoot();
	});

	// Refetch on external mutations or tab refocus — clear cached children since
	// any page could have changed.
	onMount(() => {
		const refetch = () => { childrenCache = {}; loadRoot(); };
		const unsubPages = invalidations.subscribe('pages:*', refetch);
		const unsubFocus = invalidations.subscribe('*:focus', refetch);
		return () => { unsubPages(); unsubFocus(); };
	});

	function getPageChildren(route: string): PageSummary[] {
		return childrenCache[route] ?? [];
	}

	function matchesSearch(page: PageSummary): boolean {
		if (!searchQuery) return true;
		const q = searchQuery.toLowerCase();
		return page.title.toLowerCase().includes(q) ||
			page.route.toLowerCase().includes(q) ||
			page.template.toLowerCase().includes(q);
	}

	/** Get the parent route of a page */
	function getParentRoute(page: PageSummary): string {
		const parts = page.route.split('/').filter(Boolean);
		if (parts.length <= 1) return '/';
		return '/' + parts.slice(0, -1).join('/');
	}

	// --- Drag-and-drop handlers ---

	function handleDragStart(e: DragEvent, page: PageSummary) {
		if (!reorderMode) return;
		dragPage = page;
		dragParentRoute = getParentRoute(page);
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', page.route);
		}
	}

	function handleDragOver(e: DragEvent, parentRoute: string, index: number) {
		if (!reorderMode || !dragPage) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		dropTarget = { parentRoute, index };
	}

	function handleDragLeave() {
		// Small delay to prevent flicker when moving between adjacent elements
		setTimeout(() => {
			// Only clear if no new target was set
		}, 50);
	}

	async function handleDrop(e: DragEvent, targetParentRoute: string, targetIndex: number) {
		e.preventDefault();
		if (!dragPage || saving) return;

		const page = dragPage;
		const sourceParentRoute = dragParentRoute!;
		const siblings = getPageChildren(targetParentRoute);

		// Build the reorder operations
		const ops: ReorganizeOperation[] = [];

		if (sourceParentRoute === targetParentRoute) {
			// Same parent — reorder siblings
			const currentIndex = siblings.findIndex(s => s.route === page.route);
			if (currentIndex === -1 || currentIndex === targetIndex) {
				resetDragState();
				return;
			}

			// Build new order
			const reordered = [...siblings];
			const [moved] = reordered.splice(currentIndex, 1);
			reordered.splice(targetIndex, 0, moved);

			reordered.forEach((p, i) => {
				ops.push({ route: p.route, position: i + 1 });
			});
		} else {
			// Cross-parent move
			ops.push({
				route: page.route,
				parent: targetParentRoute,
				position: targetIndex + 1,
			});

			// Re-number remaining siblings in source parent
			const sourceSiblings = getPageChildren(sourceParentRoute).filter(s => s.route !== page.route);
			sourceSiblings.forEach((p, i) => {
				ops.push({ route: p.route, position: i + 1 });
			});

			// Re-number siblings in target parent (inserting the new page)
			const targetSiblings = [...siblings];
			targetSiblings.splice(targetIndex, 0, page);
			targetSiblings.forEach((p, i) => {
				if (p.route !== page.route) {
					ops.push({ route: p.route, position: i + 1 });
				}
			});
		}

		resetDragState();
		saving = true;

		try {
			await reorganizePages(ops);
			toast.success(`Moved "${page.title}"`);
			// Refresh affected parents
			delete childrenCache[sourceParentRoute];
			delete childrenCache[targetParentRoute];
			if (sourceParentRoute === '/') {
				await loadRoot();
			} else {
				await loadChildren(sourceParentRoute);
			}
			if (targetParentRoute !== sourceParentRoute) {
				if (targetParentRoute === '/') {
					await loadRoot();
				} else {
					await loadChildren(targetParentRoute);
				}
			}
		} catch {
			toast.error('Failed to reorganize pages');
		} finally {
			saving = false;
		}
	}

	function handleDragEnd() {
		resetDragState();
	}

	function resetDragState() {
		dragPage = null;
		dragParentRoute = null;
		dropTarget = null;
	}

	function isDropTarget(parentRoute: string, index: number): boolean {
		return dropTarget?.parentRoute === parentRoute && dropTarget?.index === index;
	}

	function isDragging(page: PageSummary): boolean {
		return dragPage?.route === page.route;
	}
</script>

{#snippet sortHeader(label: string, field: SortField, align: string = 'left')}
	<button
		class="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider transition-colors
			{sortField === field ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}
			{align === 'right' ? 'ml-auto' : ''}"
		onclick={() => toggleSort(field)}
	>
		{label}
		{#if sortField === field}
			{#if sortOrder === 'asc'}
				<ArrowUp size={11} />
			{:else}
				<ArrowDown size={11} />
			{/if}
		{/if}
	</button>
{/snippet}

<!-- Sortable header -->
<div class="flex items-center gap-4 border-b border-border px-4 py-2">
	{#if reorderMode}<div class="w-6"></div>{/if}
	<div class="flex-1">{@render sortHeader('Title', 'title')}</div>
	{#if !reorderMode}
		<div class="w-20 text-center">
			<span class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Template</span>
		</div>
		<div class="w-16 text-center">
			<span class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Status</span>
		</div>
		<div class="w-24 text-right">{@render sortHeader('Modified', 'modified', 'right')}</div>
		<div class="w-10"></div>
	{/if}
</div>

{#if rootLoading}
	<div class="py-12 text-center text-sm text-muted-foreground">
		<Loader2 size={16} class="mx-auto mb-2 animate-spin" />
		Loading pages...
	</div>
{:else}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	{#snippet treeRow(page: PageSummary, depth: number, parentRoute: string, index: number)}
		{#if matchesSearch(page)}
			{#if reorderMode && isDropTarget(parentRoute, index) && !isDragging(page)}
				<div class="mx-4 h-0.5 rounded bg-primary transition-all" style="margin-left: {16 + depth * 20}px"></div>
			{/if}
			<div
				class="group flex items-center gap-4 border-b border-border/50 px-4 py-2 transition-colors
					{isDragging(page) ? 'opacity-30' : 'hover:bg-accent/50'}
					{saving ? 'pointer-events-none' : ''}"
				draggable={reorderMode}
				ondragstart={(e) => handleDragStart(e, page)}
				ondragover={(e) => handleDragOver(e, parentRoute, index)}
				ondrop={(e) => handleDrop(e, parentRoute, index)}
				ondragend={handleDragEnd}
			>
				<div class="flex min-w-0 flex-1 items-center gap-1" style="padding-left: {depth * 20}px">
					{#if reorderMode}
						<span class="flex shrink-0 cursor-grab items-center text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing">
							<GripVertical size={14} />
						</span>
					{/if}

					{#if page.has_children}
						<button
							class="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
							onclick={() => toggleExpand(page.route)}
						>
							{#if loadingRoutes.has(page.route)}
								<Loader2 size={13} class="animate-spin" />
							{:else if expandedRoutes.has(page.route)}
								<ChevronDown size={14} />
							{:else}
								<ChevronRight size={14} />
							{/if}
						</button>
					{:else}
						<span class="w-5"></span>
					{/if}

					{#if page.has_children}
						{#if expandedRoutes.has(page.route)}
							<FolderOpen size={14} class="shrink-0 text-primary" />
						{:else}
							<Folder size={14} class="shrink-0 text-primary/70" />
						{/if}
					{:else}
						<File size={14} class="shrink-0 text-muted-foreground" />
					{/if}

					<button class="min-w-0 flex-1 text-left pl-1" onclick={() => onEdit(page.route)}>
						<div class="flex items-center gap-1.5">
							<span class="truncate text-sm font-medium group-hover:text-primary
								{lang && page.language !== lang ? 'text-muted-foreground italic' : 'text-foreground'}">{page.menu}</span>
							{#if lang && page.translated_languages}
								<TranslationBadges translated={Object.keys(page.translated_languages)} currentLang={lang} />
							{/if}
						</div>
						<div class="truncate text-[11px] text-muted-foreground">{page.route}</div>
					</button>
				</div>

				{#if !reorderMode}
					<div class="w-20 text-center">
						<Badge variant="outline">{page.template}</Badge>
					</div>

					<div class="w-16 text-center">
						{#if page.published}
							<Badge variant="success">Published</Badge>
						{:else}
							<Badge variant="secondary">Draft</Badge>
						{/if}
					</div>

					<div class="w-24 text-right text-[11px] text-muted-foreground">
						{formatDate(page.modified)}
					</div>

					<div class="flex w-10 justify-end opacity-0 transition-opacity group-hover:opacity-100">
						<button
							class="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
							onclick={() => onDelete(page)}
							title="Delete"
						>
							<Trash2 size={12} />
						</button>
					</div>
				{/if}
			</div>

			{#if page.has_children && expandedRoutes.has(page.route)}
				{#each getPageChildren(page.route) as child, childIndex (child.route)}
					{@render treeRow(child, depth + 1, page.route, childIndex)}
				{/each}
				{#if reorderMode && isDropTarget(page.route, getPageChildren(page.route).length)}
					<div class="mx-4 h-0.5 rounded bg-primary transition-all" style="margin-left: {16 + (depth + 1) * 20}px"></div>
				{/if}
			{/if}
		{/if}
	{/snippet}

	{#each rootPages as page, index (page.route)}
		{@render treeRow(page, 0, '/', index)}
	{/each}

	{#if reorderMode && rootPages.length > 0 && isDropTarget('/', rootPages.length)}
		<div class="mx-4 h-0.5 rounded bg-primary"></div>
	{/if}

	{#if rootPages.length === 0}
		<div class="py-12 text-center text-sm text-muted-foreground">No pages found</div>
	{/if}
{/if}
