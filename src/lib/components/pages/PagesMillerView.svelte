<script lang="ts">
	import { getChildren } from '$lib/api/endpoints/pages';
	import type { PageSummary } from '$lib/api/endpoints/pages';
	import { Badge } from '$lib/components/ui/badge';
	import {
		Folder, File, Loader2, ChevronRight
	} from 'lucide-svelte';

	interface Props {
		onEdit: (route: string) => void;
	}

	let { onEdit }: Props = $props();

	interface Column {
		parentRoute: string;
		pages: PageSummary[];
		selectedRoute: string | null;
		loading: boolean;
	}

	let columns = $state<Column[]>([]);

	async function loadColumn(parentRoute: string): Promise<PageSummary[]> {
		try {
			return await getChildren(parentRoute);
		} catch {
			return [];
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
		// Update selection in current column
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

	// Currently selected page (last selection)
	const selectedPage = $derived(() => {
		for (let i = columns.length - 1; i >= 0; i--) {
			if (columns[i].selectedRoute) {
				return columns[i].pages.find(p => p.route === columns[i].selectedRoute) ?? null;
			}
		}
		return null;
	});
</script>

<!-- Breadcrumb -->
<div class="flex items-center gap-1 border-b border-border px-4 py-2 text-[12px]">
	<button
		class="text-muted-foreground transition-colors hover:text-foreground"
		onclick={() => {
			columns = columns.slice(0, 1);
			columns[0] = { ...columns[0], selectedRoute: null };
		}}
	>
		/
	</button>
	{#each breadcrumb as crumb, i}
		<ChevronRight size={11} class="text-muted-foreground" />
		<button
			class="truncate transition-colors {i === breadcrumb.length - 1 ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}"
			onclick={() => {
				const targetColIndex = columns.findIndex(c => c.selectedRoute === crumb.route);
				if (targetColIndex >= 0) {
					columns = columns.slice(0, targetColIndex + 1);
				}
			}}
		>
			{crumb.title}
		</button>
	{/each}
</div>

<!-- Miller columns -->
<div class="flex overflow-x-auto" style="min-height: 400px;">
	{#each columns as col, colIndex (col.parentRoute)}
		<div class="flex w-64 shrink-0 flex-col border-r border-border last:border-r-0 {colIndex < columns.length - 1 ? 'bg-accent/30' : ''}">
			{#if col.loading}
				<div class="flex flex-1 items-center justify-center">
					<Loader2 size={16} class="animate-spin text-muted-foreground" />
				</div>
			{:else}
				{#each col.pages as page (page.route)}
					<button
						class="flex w-full items-center gap-2 border-b border-border/50 px-3 py-2 text-left transition-colors
							{col.selectedRoute === page.route
								? 'bg-primary/10 text-primary'
								: 'text-foreground hover:bg-accent/50'}"
						onclick={() => selectPage(colIndex, page)}
						ondblclick={() => onEdit(page.route)}
					>
						{#if page.has_children}
							<Folder size={14} class="shrink-0 text-amber-500" />
						{:else}
							<File size={14} class="shrink-0 text-muted-foreground" />
						{/if}
						<div class="min-w-0 flex-1">
							<div class="truncate text-[13px] font-medium">{page.title}</div>
							<div class="truncate text-[10px] text-muted-foreground">{page.template} · {formatDate(page.modified)}</div>
						</div>
						{#if page.has_children}
							<ChevronRight size={13} class="shrink-0 text-muted-foreground" />
						{/if}
					</button>
				{/each}

				{#if col.pages.length === 0 && !col.loading}
					<div class="flex flex-1 items-center justify-center text-xs text-muted-foreground">
						No pages
					</div>
				{/if}
			{/if}
		</div>
	{/each}

	<!-- Detail panel for selected leaf page -->
	{#if selectedPage() && !selectedPage()?.has_children}
		{@const sel = selectedPage()!}
		<div class="w-72 shrink-0 p-4">
			<h3 class="text-sm font-semibold text-foreground">{sel.title}</h3>
			<p class="mt-0.5 text-[11px] text-muted-foreground">{sel.route}</p>

			<dl class="mt-4 space-y-2 text-[12px]">
				<div class="flex justify-between">
					<dt class="text-muted-foreground">Template</dt>
					<dd><Badge variant="outline">{sel.template}</Badge></dd>
				</div>
				<div class="flex justify-between">
					<dt class="text-muted-foreground">Status</dt>
					<dd>
						{#if sel.published}
							<Badge variant="success">Published</Badge>
						{:else}
							<Badge variant="secondary">Draft</Badge>
						{/if}
					</dd>
				</div>
				<div class="flex justify-between">
					<dt class="text-muted-foreground">Modified</dt>
					<dd class="text-foreground">{formatDate(sel.modified)}</dd>
				</div>
			</dl>

			<button
				class="mt-4 inline-flex w-full items-center justify-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
				onclick={() => onEdit(sel.route)}
			>
				Edit Page
			</button>
		</div>
	{/if}
</div>
