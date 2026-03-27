<script lang="ts">
	import { goto } from '$app/navigation';
	import { getPagesList, deletePage } from '$lib/api/endpoints/pages';
	import type { PageSummary, PageListParams } from '$lib/api/endpoints/pages';
	import {
		FileText,
		Plus,
		Search,
		ChevronRight,
		ChevronDown,
		Eye,
		EyeOff,
		MoreVertical,
		Trash2,
		Copy,
		Move,
		RefreshCw,
		Filter,
		FolderOpen,
		File
	} from 'lucide-svelte';

	interface TreeNode {
		page: PageSummary;
		children: TreeNode[];
		expanded: boolean;
		depth: number;
	}

	let allPages = $state<PageSummary[]>([]);
	let loading = $state(true);
	let error = $state('');
	let searchQuery = $state('');
	let sortField = $state<PageListParams['sort']>('order');
	let sortOrder = $state<'asc' | 'desc'>('asc');
	let filterTemplate = $state('');
	let showFilters = $state(false);
	let expandedPaths = $state<Set<string>>(new Set(['/']));

	// Build tree from flat page list
	function buildTree(pages: PageSummary[]): TreeNode[] {
		const nodeMap = new Map<string, TreeNode>();
		const roots: TreeNode[] = [];

		// Sort pages by route depth then order
		const sorted = [...pages].sort((a, b) => {
			const depthA = a.route.split('/').length;
			const depthB = b.route.split('/').length;
			if (depthA !== depthB) return depthA - depthB;
			const orderA = a.order ? parseInt(a.order) : 999;
			const orderB = b.order ? parseInt(b.order) : 999;
			return orderA - orderB;
		});

		for (const page of sorted) {
			const node: TreeNode = {
				page,
				children: [],
				expanded: expandedPaths.has(page.route),
				depth: page.route.split('/').filter(Boolean).length
			};
			nodeMap.set(page.route, node);

			// Find parent route
			const parts = page.route.split('/').filter(Boolean);
			parts.pop();
			const parentRoute = parts.length === 0 ? '/' : '/' + parts.join('/');

			const parent = nodeMap.get(parentRoute);
			if (parent) {
				parent.children.push(node);
			} else {
				roots.push(node);
			}
		}

		return roots;
	}

	// Flatten tree for rendering (only expanded nodes)
	function flattenTree(nodes: TreeNode[]): TreeNode[] {
		const result: TreeNode[] = [];
		for (const node of nodes) {
			result.push(node);
			if (node.expanded && node.children.length > 0) {
				result.push(...flattenTree(node.children));
			}
		}
		return result;
	}

	const tree = $derived(buildTree(filteredPages));
	const flatNodes = $derived(flattenTree(tree));

	const filteredPages = $derived.by(() => {
		let pages = allPages;
		if (searchQuery) {
			const q = searchQuery.toLowerCase();
			pages = pages.filter(
				(p) =>
					p.title.toLowerCase().includes(q) ||
					p.route.toLowerCase().includes(q) ||
					p.slug.toLowerCase().includes(q)
			);
		}
		if (filterTemplate) {
			pages = pages.filter((p) => p.template === filterTemplate);
		}
		return pages;
	});

	const templates = $derived([...new Set(allPages.map((p) => p.template))].sort());

	function toggleExpand(route: string) {
		const newSet = new Set(expandedPaths);
		if (newSet.has(route)) {
			newSet.delete(route);
		} else {
			newSet.add(route);
		}
		expandedPaths = newSet;
	}

	function expandAll() {
		expandedPaths = new Set(allPages.map((p) => p.route));
	}

	function collapseAll() {
		expandedPaths = new Set();
	}

	async function loadPages() {
		loading = true;
		error = '';
		try {
			allPages = await getPagesList({
				per_page: 100,
				sort: sortField,
				order: sortOrder
			});
			// Auto-expand root level
			if (expandedPaths.size === 1 && expandedPaths.has('/')) {
				const rootRoutes = allPages
					.filter((p) => p.route.split('/').filter(Boolean).length <= 1)
					.map((p) => p.route);
				expandedPaths = new Set(['/', ...rootRoutes]);
			}
		} catch {
			error = 'Failed to load pages';
		} finally {
			loading = false;
		}
	}

	async function handleDelete(page: PageSummary) {
		if (!confirm(`Delete "${page.title}" at ${page.route}?`)) return;
		try {
			await deletePage(page.route, { children: true });
			await loadPages();
		} catch {
			error = `Failed to delete ${page.route}`;
		}
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

	$effect(() => {
		loadPages();
	});
</script>

<svelte:head>
	<title>Pages — Grav Admin</title>
</svelte:head>

<div class="mx-auto max-w-7xl space-y-4">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-semibold text-foreground">Pages</h1>
			<p class="text-sm text-muted-foreground">{allPages.length} pages total</p>
		</div>
		<div class="flex items-center gap-2">
			<button
				class="inline-flex items-center justify-center rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent gap-2"
				onclick={loadPages}
				disabled={loading}
			>
				<RefreshCw size={14} class={loading ? 'animate-spin' : ''} />
				Refresh
			</button>
			<button
				class="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 gap-2"
				onclick={() => goto('/pages/new')}
			>
				<Plus size={14} />
				Add Page
			</button>
		</div>
	</div>

	<!-- Toolbar: Search + Filters -->
	<div class="rounded-lg border border-border bg-card p-4">
		<div class="flex flex-wrap items-center gap-3">
			<!-- Search -->
			<div class="relative flex-1" style="min-width: 200px;">
				<Search size={14} class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
				<input
					type="text"
					class="flex h-9 w-full rounded-md border border-input bg-transparent pl-9 px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
					placeholder="Search pages..."
					bind:value={searchQuery}
				/>
			</div>

			<!-- Filter toggle -->
			<button
				class="inline-flex items-center rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent gap-1"
				onclick={() => showFilters = !showFilters}
			>
				<Filter size={14} />
				Filters
			</button>

			<!-- Tree controls -->
			<button class="inline-flex items-center rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent" onclick={expandAll}>Expand All</button>
			<button class="inline-flex items-center rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent" onclick={collapseAll}>Collapse All</button>
		</div>

		<!-- Filter row -->
		{#if showFilters}
			<div class="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
				<label class="flex items-center gap-2 text-sm text-muted-foreground">
					Template:
					<select class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" bind:value={filterTemplate} style="width: auto; min-width: 120px;">
						<option value="">All</option>
						{#each templates as tmpl}
							<option value={tmpl}>{tmpl}</option>
						{/each}
					</select>
				</label>

				<label class="flex items-center gap-2 text-sm text-muted-foreground">
					Sort:
					<select class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" bind:value={sortField} onchange={loadPages} style="width: auto; min-width: 120px;">
						<option value="order">Order</option>
						<option value="title">Title</option>
						<option value="modified">Modified</option>
						<option value="date">Date</option>
						<option value="slug">Slug</option>
					</select>
				</label>
			</div>
		{/if}
	</div>

	<!-- Error -->
	{#if error}
		<div class="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950/30 dark:text-red-300">{error}</div>
	{/if}

	<!-- Pages Tree -->
	<div class="overflow-hidden rounded-lg border border-border bg-card">
		<!-- Table header -->
		<div class="flex items-center gap-4 border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
			<div class="flex-1">Title</div>
			<div class="w-24 text-center">Template</div>
			<div class="w-20 text-center">Status</div>
			<div class="w-24 text-right">Modified</div>
			<div class="w-16"></div>
		</div>

		{#if loading && allPages.length === 0}
			<div class="py-12 text-center text-sm text-muted-foreground">Loading pages...</div>
		{:else if flatNodes.length === 0}
			<div class="py-12 text-center text-sm text-muted-foreground">
				{searchQuery ? 'No pages match your search' : 'No pages found'}
			</div>
		{:else}
			<div class="divide-y divide-border">
				{#each flatNodes as node (node.page.route)}
					<div
						class="group flex items-center gap-4 px-4 py-2.5 transition-colors hover:bg-accent"
					>
						<!-- Title with tree indentation -->
						<div class="flex min-w-0 flex-1 items-center gap-1" style="padding-left: {node.depth * 20}px">
							<!-- Expand/collapse toggle -->
							{#if node.children.length > 0}
								<button
									class="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
									onclick={() => toggleExpand(node.page.route)}
								>
									{#if node.expanded}
										<ChevronDown size={14} />
									{:else}
										<ChevronRight size={14} />
									{/if}
								</button>
							{:else}
								<span class="w-5"></span>
							{/if}

							<!-- Icon -->
							{#if node.children.length > 0}
								<FolderOpen size={14} class="shrink-0 text-amber-500" />
							{:else}
								<File size={14} class="shrink-0 text-muted-foreground" />
							{/if}

							<!-- Title & route -->
							<a
								href="/pages/edit{node.page.route}"
								class="min-w-0 flex-1 pl-1"
							>
								<div class="truncate text-sm font-medium text-foreground group-hover:text-primary">
									{node.page.title}
								</div>
								<div class="truncate text-xs text-muted-foreground">{node.page.route}</div>
							</a>
						</div>

						<!-- Template -->
						<div class="w-24 text-center">
							<span class="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{node.page.template}</span>
						</div>

						<!-- Status -->
						<div class="w-20 text-center">
							{#if node.page.published}
								<span class="inline-flex items-center rounded-md bg-emerald-600/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">Published</span>
							{:else}
								<span class="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Draft</span>
							{/if}
						</div>

						<!-- Modified -->
						<div class="w-24 text-right text-xs text-muted-foreground">
							{formatDate(node.page.modified)}
						</div>

						<!-- Actions -->
						<div class="flex w-16 justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
							<button
								class="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
								title="Delete"
								onclick={() => handleDelete(node.page)}
							>
								<Trash2 size={12} />
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
