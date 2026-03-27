<script lang="ts">
	import { getPagesList } from '$lib/api/endpoints/pages';
	import type { PageSummary, PageListParams } from '$lib/api/endpoints/pages';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import {
		ArrowUp, ArrowDown, File, Loader2, Trash2, ChevronLeft, ChevronRight
	} from 'lucide-svelte';

	interface Props {
		searchQuery?: string;
		onEdit: (route: string) => void;
		onDelete: (page: PageSummary) => void;
	}

	let { searchQuery = '', onEdit, onDelete }: Props = $props();

	let pages = $state<PageSummary[]>([]);
	let loading = $state(true);
	let currentPage = $state(1);
	let totalPages = $state(1);
	let sortField = $state<PageListParams['sort']>('modified');
	let sortOrder = $state<'asc' | 'desc'>('desc');
	const perPage = 20;

	async function loadPages() {
		loading = true;
		try {
			pages = await getPagesList({
				page: currentPage,
				per_page: perPage,
				sort: sortField,
				order: sortOrder,
			});
			// Estimate total pages (API doesn't return meta in unwrapped response)
			totalPages = pages.length < perPage ? currentPage : currentPage + 1;
		} catch { /* handled */ }
		finally { loading = false; }
	}

	function toggleSort(field: PageListParams['sort']) {
		if (sortField === field) {
			sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
		} else {
			sortField = field;
			sortOrder = field === 'modified' || field === 'date' ? 'desc' : 'asc';
		}
		currentPage = 1;
		loadPages();
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

	// Filter by search
	const filteredPages = $derived(
		searchQuery
			? pages.filter(p =>
				p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
				p.route.toLowerCase().includes(searchQuery.toLowerCase()))
			: pages
	);

	$effect(() => { loadPages(); });
</script>

{#snippet sortHeader(label: string, field: PageListParams['sort'], width: string, align: string = 'left')}
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
	<div class="flex-1">{@render sortHeader('Title', 'title', 'flex-1')}</div>
	<div class="w-24">{@render sortHeader('Template', 'slug', 'w-24')}</div>
	<div class="w-16 text-center">
		<span class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Status</span>
	</div>
	<div class="w-24 text-right">{@render sortHeader('Modified', 'modified', 'w-24', 'right')}</div>
	<div class="w-10"></div>
</div>

{#if loading}
	<div class="py-12 text-center text-sm text-muted-foreground">
		<Loader2 size={16} class="mx-auto mb-2 animate-spin" />
		Loading pages...
	</div>
{:else}
	{#each filteredPages as page (page.route)}
		<div class="group flex items-center gap-4 border-b border-border/50 px-4 py-2 transition-colors hover:bg-accent/50">
			<div class="flex min-w-0 flex-1 items-center gap-2">
				<File size={14} class="shrink-0 text-muted-foreground" />
				<button class="min-w-0 flex-1 text-left" onclick={() => onEdit(page.route)}>
					<div class="truncate text-sm font-medium text-foreground group-hover:text-primary">{page.title}</div>
					<div class="truncate text-[11px] text-muted-foreground">{page.route}</div>
				</button>
			</div>

			<div class="w-24">
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
	{/each}

	{#if filteredPages.length === 0}
		<div class="py-12 text-center text-sm text-muted-foreground">
			{searchQuery ? 'No pages match your search' : 'No pages found'}
		</div>
	{/if}

	<!-- Pagination -->
	{#if totalPages > 1 || currentPage > 1}
		<div class="flex items-center justify-between border-t border-border px-4 py-2">
			<span class="text-xs text-muted-foreground">Page {currentPage}</span>
			<div class="flex gap-1">
				<Button variant="outline" size="sm" disabled={currentPage <= 1} onclick={() => { currentPage--; loadPages(); }}>
					<ChevronLeft size={14} /> Prev
				</Button>
				<Button variant="outline" size="sm" disabled={pages.length < perPage} onclick={() => { currentPage++; loadPages(); }}>
					Next <ChevronRight size={14} />
				</Button>
			</div>
		</div>
	{/if}
{/if}
