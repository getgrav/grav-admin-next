<script lang="ts">
	import { getChildren, getPage } from '$lib/api/endpoints/pages';
	import type { PageSummary, PageDetail } from '$lib/api/endpoints/pages';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import {
		Folder, File, Loader2, ChevronRight, ExternalLink, ArrowUpDown
	} from 'lucide-svelte';

	type SortField = 'order' | 'title' | 'modified' | 'date';

	interface Props {
		onEdit: (route: string) => void;
	}

	let { onEdit }: Props = $props();

	let sortField = $state<SortField>('order');
	let sortOrder = $state<'asc' | 'desc'>('asc');

	interface Column {
		parentRoute: string;
		pages: PageSummary[];
		selectedRoute: string | null;
		loading: boolean;
	}

	let columns = $state<Column[]>([]);
	let previewPage = $state<PageDetail | null>(null);
	let previewLoading = $state(false);

	async function loadColumn(parentRoute: string): Promise<PageSummary[]> {
		try {
			return await getChildren(parentRoute, sortField, sortOrder);
		} catch {
			return [];
		}
	}

	function handleSortChange(e: Event) {
		const val = (e.target as HTMLSelectElement).value;
		const [field, order] = val.split(':') as [SortField, 'asc' | 'desc'];
		sortField = field;
		sortOrder = order;
		// Reload from root with new sort
		(async () => {
			const rootPages = await loadColumn('/');
			columns = [{
				parentRoute: '/',
				pages: rootPages,
				selectedRoute: null,
				loading: false,
			}];
			previewPage = null;
		})();
	}

	async function loadPreview(route: string) {
		previewLoading = true;
		try {
			previewPage = await getPage(route, { render: true });
		} catch {
			previewPage = null;
		} finally {
			previewLoading = false;
		}
	}

	// Initialize with root
	$effect(() => {
		(async () => {
			const rootPages = await loadColumn('/');
			columns = [{
				parentRoute: '/',
				pages: rootPages,
				selectedRoute: null,
				loading: false,
			}];
		})();
	});

	async function selectPage(colIndex: number, page: PageSummary) {
		// Update selection in current column, trim columns after
		const updated = columns.slice(0, colIndex + 1);
		updated[colIndex] = { ...updated[colIndex], selectedRoute: page.route };

		if (page.has_children) {
			// Add new column for children
			updated.push({
				parentRoute: page.route,
				pages: [],
				selectedRoute: null,
				loading: true,
			});
			columns = updated;

			// Load children
			const children = await loadColumn(page.route);
			columns = columns.map((col, i) =>
				i === colIndex + 1 ? { ...col, pages: children, loading: false } : col
			);
		} else {
			columns = updated;
		}

		// Always load preview for selected page
		loadPreview(page.route);
	}

	function formatDate(dateStr: string): string {
		const date = new Date(dateStr);
		const now = new Date();
		const diff = now.getTime() - date.getTime();
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);
		if (hours < 24) return `${hours}h ago`;
		if (days < 7) return `${days}d ago`;
		return date.toLocaleDateString();
	}

	// Breadcrumb from column selections
	const breadcrumb = $derived(
		columns
			.filter(c => c.selectedRoute)
			.map(c => {
				const page = c.pages.find(p => p.route === c.selectedRoute);
				return { route: c.selectedRoute!, title: page?.title ?? c.selectedRoute! };
			})
	);

	// Get the last selected page summary
	const lastSelected = $derived.by(() => {
		for (let i = columns.length - 1; i >= 0; i--) {
			if (columns[i].selectedRoute) {
				return columns[i].pages.find(p => p.route === columns[i].selectedRoute) ?? null;
			}
		}
		return null;
	});

	// Index of the last column that has a selection (the "active" column)
	const activeColumnIndex = $derived.by(() => {
		for (let i = columns.length - 1; i >= 0; i--) {
			if (columns[i].selectedRoute) return i;
		}
		return -1;
	});
</script>

<!-- Breadcrumb + Sort -->
<div class="flex items-center gap-1 border-b border-border px-4 py-2 text-[12px]">
	<button
		class="font-medium text-muted-foreground transition-colors hover:text-foreground"
		onclick={() => {
			columns = columns.slice(0, 1);
			columns[0] = { ...columns[0], selectedRoute: null };
			previewPage = null;
		}}
	>
		Pages
	</button>
	{#each breadcrumb as crumb, i}
		<ChevronRight size={11} class="text-muted-foreground/50" />
		<button
			class="max-w-[120px] truncate transition-colors {i === breadcrumb.length - 1 ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}"
			onclick={() => {
				const targetColIndex = columns.findIndex(c => c.selectedRoute === crumb.route);
				if (targetColIndex >= 0) {
					columns = columns.slice(0, targetColIndex + 2);
					if (columns[targetColIndex + 1]) {
						columns[targetColIndex + 1] = { ...columns[targetColIndex + 1], selectedRoute: null };
					}
				}
			}}
		>
			{crumb.title}
		</button>
	{/each}

	<div class="ml-auto flex items-center gap-1.5 text-muted-foreground">
		<ArrowUpDown size={11} />
		<select
			class="h-6 rounded border-0 bg-transparent pr-6 text-[11px] font-medium focus:outline-none focus:ring-0"
			value={`${sortField}:${sortOrder}`}
			onchange={handleSortChange}
		>
			<option value="order:asc">Order</option>
			<option value="title:asc">Title A-Z</option>
			<option value="title:desc">Title Z-A</option>
			<option value="modified:desc">Newest</option>
			<option value="modified:asc">Oldest</option>
			<option value="date:desc">Date (newest)</option>
		</select>
	</div>
</div>

<!-- Miller columns + preview -->
<div class="flex" style="min-height: 500px; max-height: calc(100vh - 220px);">
	<!-- Scrollable columns area -->
	<div class="flex flex-1 overflow-x-auto">
		{#each columns as col, colIndex (colIndex)}
			<div class="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-border {colIndex < columns.length - 1 ? 'bg-muted/30' : ''}">
				{#if col.loading}
					<div class="flex flex-1 items-center justify-center">
						<Loader2 size={16} class="animate-spin text-muted-foreground" />
					</div>
				{:else}
					{#each col.pages as page (page.route)}
						{@const isSelected = col.selectedRoute === page.route}
					{@const isActive = isSelected && colIndex === activeColumnIndex}
					{@const isPath = isSelected && colIndex !== activeColumnIndex}
					<button
							class="flex w-full items-center gap-2 border-b border-border/40 px-3 py-2 text-left transition-all
								{isActive
									? 'bg-primary text-primary-foreground'
									: isPath
										? 'bg-accent text-accent-foreground'
										: 'text-foreground hover:bg-accent'}"
							onclick={() => selectPage(colIndex, page)}
							ondblclick={() => onEdit(page.route)}
						>
							{#if page.has_children}
								<Folder size={14} class="shrink-0 {isActive ? 'text-primary-foreground/80' : 'text-amber-500'}" />
							{:else}
								<File size={14} class="shrink-0 {isActive ? 'text-primary-foreground/60' : 'text-muted-foreground'}" />
							{/if}
							<div class="min-w-0 flex-1">
								<div class="truncate text-[13px] font-medium">{page.title}</div>
							</div>
							{#if page.has_children}
								<ChevronRight size={12} class="shrink-0 {isActive ? 'text-primary-foreground/60' : 'text-muted-foreground/50'}" />
							{/if}
						</button>
					{/each}

					{#if col.pages.length === 0}
						<div class="flex flex-1 items-center justify-center text-xs text-muted-foreground">
							Empty
						</div>
					{/if}
				{/if}
			</div>
		{/each}
	</div>

	<!-- Preview panel (always visible when something is selected) -->
	{#if lastSelected}
		<div class="w-80 shrink-0 overflow-y-auto border-l border-border bg-card">
			{#if previewLoading}
				<div class="flex h-full items-center justify-center">
					<Loader2 size={16} class="animate-spin text-muted-foreground" />
				</div>
			{:else if previewPage}
				<div class="p-5">
					<!-- Title & route -->
					<h3 class="text-base font-semibold text-foreground">{previewPage.title}</h3>
					<p class="mt-0.5 text-[11px] text-muted-foreground">{previewPage.route}</p>

					<!-- Badges -->
					<div class="mt-3 flex flex-wrap gap-1.5">
						<Badge variant="outline">{previewPage.template}</Badge>
						{#if previewPage.published}
							<Badge variant="success">Published</Badge>
						{:else}
							<Badge variant="secondary">Draft</Badge>
						{/if}
						{#if previewPage.has_children}
							<Badge variant="secondary">Has children</Badge>
						{/if}
					</div>

					<!-- Metadata -->
					<dl class="mt-4 space-y-1.5 text-[12px]">
						<div class="flex justify-between">
							<dt class="text-muted-foreground">Modified</dt>
							<dd class="text-foreground">{new Date(previewPage.modified).toLocaleString()}</dd>
						</div>
						{#if previewPage.language}
							<div class="flex justify-between">
								<dt class="text-muted-foreground">Language</dt>
								<dd class="text-foreground">{previewPage.language}</dd>
							</div>
						{/if}
						{#if previewPage.order}
							<div class="flex justify-between">
								<dt class="text-muted-foreground">Order</dt>
								<dd class="text-foreground">{previewPage.order}</dd>
							</div>
						{/if}
					</dl>

					<!-- Content preview -->
					{#if previewPage.content_html}
						<div class="mt-4 border-t border-border pt-4">
							<h4 class="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Preview</h4>
							<div class="prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed text-foreground/80">
								{@html previewPage.content_html}
							</div>
						</div>
					{:else if previewPage.content}
						<div class="mt-4 border-t border-border pt-4">
							<h4 class="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Content</h4>
							<pre class="max-h-48 overflow-auto rounded-md bg-muted p-3 font-mono text-xs text-foreground/70">{previewPage.content}</pre>
						</div>
					{/if}

					<!-- Media -->
					{#if previewPage.media && previewPage.media.length > 0}
						<div class="mt-4 border-t border-border pt-4">
							<h4 class="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Media ({previewPage.media.length})</h4>
							<ul class="space-y-1">
								{#each previewPage.media as m}
									<li class="flex items-center justify-between text-xs">
										<span class="truncate text-foreground">{m.filename}</span>
										<span class="text-muted-foreground">{(m.size / 1024).toFixed(0)}KB</span>
									</li>
								{/each}
							</ul>
						</div>
					{/if}

					<!-- Edit button -->
					<div class="mt-5">
						<Button class="w-full" onclick={() => onEdit(previewPage!.route)}>
							<ExternalLink size={14} />
							Edit Page
						</Button>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>
