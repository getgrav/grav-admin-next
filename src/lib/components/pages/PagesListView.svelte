<script lang="ts">
	import { getPagesList, reorganizePages } from '$lib/api/endpoints/pages';
	import type { PageSummary, PageListParams, ReorganizeOperation } from '$lib/api/endpoints/pages';
	import { Badge } from '$lib/components/ui/badge';
	import TranslationBadges from '$lib/components/ui/TranslationBadges.svelte';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import {
		ArrowUp, ArrowDown, File, Loader2, Trash2, ChevronLeft, ChevronRight,
		GripVertical
	} from 'lucide-svelte';

	interface Props {
		searchQuery?: string;
		reorderMode?: boolean;
		lang?: string;
		onEdit: (route: string) => void;
		onDelete: (page: PageSummary) => void;
	}

	let { searchQuery = '', reorderMode = false, lang, onEdit, onDelete }: Props = $props();

	let pages = $state<PageSummary[]>([]);
	let loading = $state(true);
	let currentPage = $state(1);
	let totalPages = $state(1);
	let sortField = $state<PageListParams['sort']>('modified');
	let sortOrder = $state<'asc' | 'desc'>('desc');
	const perPage = 20;

	// Drag state
	let dragPage = $state<PageSummary | null>(null);
	let dropIndex = $state<number | null>(null);
	let saving = $state(false);

	async function loadPages() {
		loading = true;
		try {
			pages = await getPagesList({
				page: currentPage,
				per_page: perPage,
				sort: sortField,
				order: sortOrder,
				lang,
				translations: !!lang,
			});
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

	const filteredPages = $derived(
		searchQuery
			? pages.filter(p =>
				p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
				p.route.toLowerCase().includes(searchQuery.toLowerCase()))
			: pages
	);

	let prevLang = lang;
	$effect(() => {
		if (lang !== prevLang) {
			prevLang = lang;
			currentPage = 1;
		}
		loadPages();
	});

	function getParentRoute(page: PageSummary): string {
		const parts = page.route.split('/').filter(Boolean);
		if (parts.length <= 1) return '/';
		return '/' + parts.slice(0, -1).join('/');
	}

	function handleDragStart(e: DragEvent, page: PageSummary) {
		if (!reorderMode) return;
		dragPage = page;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', page.route);
		}
	}

	function handleDragOver(e: DragEvent, index: number) {
		if (!reorderMode || !dragPage) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		dropIndex = index;
	}

	async function handleDrop(e: DragEvent, targetIndex: number) {
		e.preventDefault();
		if (!dragPage || saving) return;

		const source = dragPage;
		const sourceParent = getParentRoute(source);
		const target = filteredPages[targetIndex];
		const targetParent = getParentRoute(target);

		dragPage = null;
		dropIndex = null;

		if (sourceParent !== targetParent) {
			toast.error('Can only reorder pages under the same parent. Use Tree view for cross-parent moves.');
			return;
		}

		// Get all siblings in the current list that share this parent
		const siblings = filteredPages.filter(p => getParentRoute(p) === sourceParent);
		const sourceIdx = siblings.findIndex(s => s.route === source.route);
		const targetIdx = siblings.findIndex(s => s.route === target.route);
		if (sourceIdx === -1 || targetIdx === -1 || sourceIdx === targetIdx) return;

		const reordered = [...siblings];
		const [moved] = reordered.splice(sourceIdx, 1);
		reordered.splice(targetIdx, 0, moved);

		const ops: ReorganizeOperation[] = reordered.map((p, i) => ({
			route: p.route,
			position: i + 1,
		}));

		saving = true;
		try {
			await reorganizePages(ops);
			toast.success(`Reordered "${source.title}"`);
			await loadPages();
		} catch {
			toast.error('Failed to reorder');
		} finally {
			saving = false;
		}
	}

	function handleDragEnd() {
		dragPage = null;
		dropIndex = null;
	}
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
	{#if reorderMode}<div class="w-6"></div>{/if}
	<div class="flex-1">{@render sortHeader('Title', 'title', 'flex-1')}</div>
	{#if !reorderMode}
		<div class="w-20 text-center">
			<span class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Template</span>
		</div>
		<div class="w-16 text-center">
			<span class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Status</span>
		</div>
		<div class="w-24 text-right">{@render sortHeader('Modified', 'modified', 'w-24', 'right')}</div>
		<div class="w-10"></div>
	{:else}
		<div class="w-32 text-right">
			<span class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Parent</span>
		</div>
	{/if}
</div>

{#if loading}
	<div class="py-12 text-center text-sm text-muted-foreground">
		<Loader2 size={16} class="mx-auto mb-2 animate-spin" />
		Loading pages...
	</div>
{:else}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	{#each filteredPages as page, index (page.route)}
		{#if reorderMode && dropIndex === index && dragPage?.route !== page.route}
			<div class="mx-4 h-0.5 rounded bg-primary"></div>
		{/if}
		<div
			class="group flex items-center gap-4 border-b border-border/50 px-4 py-2 transition-colors
				{dragPage?.route === page.route ? 'opacity-30' : 'hover:bg-accent/50'}
				{saving ? 'pointer-events-none' : ''}"
			draggable={reorderMode}
			ondragstart={(e) => handleDragStart(e, page)}
			ondragover={(e) => handleDragOver(e, index)}
			ondrop={(e) => handleDrop(e, index)}
			ondragend={handleDragEnd}
		>
			{#if reorderMode}
				<span class="flex shrink-0 cursor-grab items-center text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing">
					<GripVertical size={14} />
				</span>
			{/if}
			<div class="flex min-w-0 flex-1 items-center gap-2">
				<File size={14} class="shrink-0 text-muted-foreground" />
				<button class="min-w-0 flex-1 text-left" onclick={() => onEdit(page.route)}>
					<div class="flex items-center gap-1.5">
						<span class="truncate text-sm font-medium group-hover:text-primary
							{lang && page.language !== lang ? 'text-muted-foreground italic' : 'text-foreground'}">{page.title}</span>
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
			{:else}
				<div class="w-32 text-right text-[11px] text-muted-foreground">
					{getParentRoute(page)}
				</div>
			{/if}
		</div>
	{/each}

	{#if filteredPages.length === 0}
		<div class="py-12 text-center text-sm text-muted-foreground">
			{searchQuery ? 'No pages match your search' : 'No pages found'}
		</div>
	{/if}

	<!-- Pagination -->
	{#if !reorderMode && (totalPages > 1 || currentPage > 1)}
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
