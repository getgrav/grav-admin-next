<script lang="ts">
	import { getChildren } from '$lib/api/endpoints/pages';
	import type { PageSummary } from '$lib/api/endpoints/pages';
	import { Badge } from '$lib/components/ui/badge';
	import {
		ChevronRight, ChevronDown, FolderOpen, Folder, File, Loader2, Trash2,
		ArrowUp, ArrowDown
	} from 'lucide-svelte';

	type SortField = 'order' | 'title' | 'modified' | 'date' | 'slug';

	interface Props {
		searchQuery?: string;
		onEdit: (route: string) => void;
		onDelete: (page: PageSummary) => void;
	}

	let { searchQuery = '', onEdit, onDelete }: Props = $props();

	let childrenCache = $state<Record<string, PageSummary[]>>({});
	let loadingRoutes = $state<Set<string>>(new Set());
	let expandedRoutes = $state<Set<string>>(new Set(['/']));
	let rootPages = $state<PageSummary[]>([]);
	let rootLoading = $state(true);
	let sortField = $state<SortField>('order');
	let sortOrder = $state<'asc' | 'desc'>('asc');

	function toggleSort(field: SortField) {
		if (sortField === field) {
			sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
		} else {
			sortField = field;
			sortOrder = field === 'modified' || field === 'date' ? 'desc' : 'asc';
		}
		// Reload everything with new sort
		childrenCache = {};
		loadRoot();
	}

	async function loadRoot() {
		rootLoading = true;
		try {
			rootPages = await getChildren('/', sortField, sortOrder);
			childrenCache = { '/': rootPages };
		} catch { /* handled */ }
		finally { rootLoading = false; }
	}

	async function loadChildren(parentRoute: string) {
		if (childrenCache[parentRoute]) return;
		loadingRoutes = new Set([...loadingRoutes, parentRoute]);
		try {
			const children = await getChildren(parentRoute, sortField, sortOrder);
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

	$effect(() => { loadRoot(); });

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
	<div class="flex-1">{@render sortHeader('Title', 'title')}</div>
	<div class="w-20 text-center">
		<span class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Template</span>
	</div>
	<div class="w-16 text-center">
		<span class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Status</span>
	</div>
	<div class="w-24 text-right">{@render sortHeader('Modified', 'modified', 'right')}</div>
	<div class="w-10"></div>
</div>

{#if rootLoading}
	<div class="py-12 text-center text-sm text-muted-foreground">
		<Loader2 size={16} class="mx-auto mb-2 animate-spin" />
		Loading pages...
	</div>
{:else}
	{#snippet treeRow(page: PageSummary, depth: number)}
		{#if matchesSearch(page)}
			<div class="group flex items-center gap-4 border-b border-border/50 px-4 py-2 transition-colors hover:bg-accent/50">
				<div class="flex min-w-0 flex-1 items-center gap-1" style="padding-left: {depth * 20}px">
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
							<FolderOpen size={14} class="shrink-0 text-amber-500" />
						{:else}
							<Folder size={14} class="shrink-0 text-amber-500/70" />
						{/if}
					{:else}
						<File size={14} class="shrink-0 text-muted-foreground" />
					{/if}

					<button class="min-w-0 flex-1 text-left pl-1" onclick={() => onEdit(page.route)}>
						<div class="truncate text-sm font-medium text-foreground group-hover:text-primary">{page.title}</div>
						<div class="truncate text-[11px] text-muted-foreground">{page.route}</div>
					</button>
				</div>

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
			</div>

			{#if page.has_children && expandedRoutes.has(page.route)}
				{#each getPageChildren(page.route) as child (child.route)}
					{@render treeRow(child, depth + 1)}
				{/each}
			{/if}
		{/if}
	{/snippet}

	{#each rootPages as page (page.route)}
		{@render treeRow(page, 0)}
	{/each}

	{#if rootPages.length === 0}
		<div class="py-12 text-center text-sm text-muted-foreground">No pages found</div>
	{/if}
{/if}
