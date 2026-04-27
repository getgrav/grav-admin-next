<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { getChildren, getPage, getPagesList, reorganizePages, pageApiRoute, parentRouteOf } from '$lib/api/endpoints/pages';
	import type { PageSummary, PageDetail, ReorganizeOperation } from '$lib/api/endpoints/pages';
	import { auth } from '$lib/stores/auth.svelte';
	import { invalidations } from '$lib/stores/invalidation.svelte';
	import { onMount } from 'svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import TranslationBadges from '$lib/components/ui/TranslationBadges.svelte';
	import { contentLang } from '$lib/stores/contentLang.svelte';
	import { toast } from 'svelte-sonner';
	import {
		Folder, File, Loader2, ChevronRight, ExternalLink, ArrowUpDown, GripVertical
	} from 'lucide-svelte';

	type SortField = 'default' | 'order' | 'title' | 'modified' | 'date';

	interface Props {
		searchQuery?: string;
		reorderMode?: boolean;
		lang?: string;
		onEdit: (route: string) => void;
	}

	let { searchQuery = '', reorderMode = false, lang, onEdit }: Props = $props();

	// Drag state for Miller columns
	let dragPage = $state<PageSummary | null>(null);
	let dragColIndex = $state<number | null>(null);
	let dropTarget = $state<{ colIndex: number; index: number } | null>(null);
	let saving = $state(false);

	// Search: build set of visible routes (matches + their ancestors)
	let allPagesCache = $state<PageSummary[] | null>(null);
	let visibleRoutes = $state<Set<string> | null>(null);
	let searchTimer: ReturnType<typeof setTimeout> | null = null;

	const isSearching = $derived(!!searchQuery.trim());

	$effect(() => {
		const query = searchQuery;
		if (searchTimer) clearTimeout(searchTimer);

		if (!query.trim()) {
			visibleRoutes = null;
			return;
		}

		searchTimer = setTimeout(async () => {
			// Fetch all pages once and cache
			if (!allPagesCache) {
				allPagesCache = await getPagesList({ per_page: 500, sort: 'title', order: 'asc' });
			}

			const q = query.toLowerCase();
			const matchingRoutes = allPagesCache.filter(p =>
				p.title.toLowerCase().includes(q) ||
				p.route.toLowerCase().includes(q) ||
				p.template.toLowerCase().includes(q)
			).map(p => p.route);

			// Build visible set: matching routes + all ancestor routes
			const visible = new Set<string>();
			for (const route of matchingRoutes) {
				visible.add(route);
				// Add all ancestors
				const parts = route.split('/').filter(Boolean);
				for (let i = 1; i <= parts.length; i++) {
					visible.add('/' + parts.slice(0, i).join('/'));
				}
			}

			visibleRoutes = visible;
		}, 200);
	});

	// Filter pages in a column based on search
	function filterColumn(pages: PageSummary[]): PageSummary[] {
		if (!visibleRoutes) return pages;
		return pages.filter(p => visibleRoutes!.has(p.route));
	}

	let sortField = $state<SortField>('default');
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
			return await getChildren(parentRoute, sortField, sortOrder, lang);
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
			previewPage = await getPage(route, { summary: true });
		} catch {
			previewPage = null;
		} finally {
			previewLoading = false;
		}
	}

	// Persist selected path across reloads
	const STORAGE_KEY = 'grav_admin_pages_miller_path';

	function saveSelectionPath() {
		const path = columns
			.filter(c => c.selectedRoute)
			.map(c => c.selectedRoute!);
		if (path.length > 0) {
			sessionStorage.setItem(STORAGE_KEY, JSON.stringify(path));
		} else {
			sessionStorage.removeItem(STORAGE_KEY);
		}
	}

	function getSavedPath(): string[] {
		try {
			const raw = sessionStorage.getItem(STORAGE_KEY);
			return raw ? JSON.parse(raw) : [];
		} catch { return []; }
	}

	async function restoreColumns(savedPath: string[]) {
		// Load root first
		const rootPages = await loadColumn('/');
		const result: Column[] = [{
			parentRoute: '/',
			pages: rootPages,
			selectedRoute: null,
			loading: false,
		}];

		// Walk the saved path, loading each level
		for (const route of savedPath) {
			const lastCol = result[result.length - 1];
			const page = lastCol.pages.find(p => p.route === route);
			if (!page) break; // page no longer exists — stop here

			lastCol.selectedRoute = route;

			if (page.has_children) {
				const children = await loadColumn(route);
				result.push({
					parentRoute: route,
					pages: children,
					selectedRoute: null,
					loading: false,
				});
			}
		}

		columns = result;

		// Load preview for last selected
		const lastRoute = savedPath[savedPath.length - 1];
		if (lastRoute && result.some(c => c.selectedRoute === lastRoute)) {
			const lastPage = result.flatMap(c => c.pages).find(p => p.route === lastRoute);
			loadPreview(lastPage ? pageApiRoute(lastPage) : lastRoute);
		}
	}

	// Initialize with root, reload when lang changes
	let prevLang = lang;
	$effect(() => {
		if (lang !== prevLang) {
			prevLang = lang;
			previewPage = null;
			allPagesCache = null;
		}
		const savedPath = getSavedPath();
		if (savedPath.length > 0) {
			restoreColumns(savedPath);
		} else {
			(async () => {
				const rootPages = await loadColumn('/');
				columns = [{
					parentRoute: '/',
					pages: rootPages,
					selectedRoute: null,
					loading: false,
				}];
			})();
		}
	});

	// Silent targeted refresh — refetches only the columns that contain the
	// affected page, preserving the user's selection trail and downstream
	// columns. No per-column loading flip, so there's no visible skeleton.
	async function silentRefreshColumn(parentRoute: string) {
		try {
			const pages = await loadColumn(parentRoute);
			columns = columns.map(col =>
				col.parentRoute === parentRoute ? { ...col, pages } : col
			);
		} catch { /* ignore */ }
	}

	onMount(() => {
		const onPages = (e: { id?: string }) => {
			allPagesCache = null;
			if (!e.id) {
				for (const col of columns) silentRefreshColumn(col.parentRoute);
				return;
			}
			const parent = parentRouteOf(e.id);
			if (columns.some(c => c.parentRoute === parent)) {
				silentRefreshColumn(parent);
			}
			// Root can also change (new top-level pages) — keep it fresh too.
			if (parent !== '/' && columns.some(c => c.parentRoute === '/')) {
				silentRefreshColumn('/');
			}
		};
		const onFocus = () => {
			allPagesCache = null;
			for (const col of columns) silentRefreshColumn(col.parentRoute);
		};
		const unsubPages = invalidations.subscribe('pages:*', onPages);
		const unsubFocus = invalidations.subscribe('*:focus', onFocus);
		return () => { unsubPages(); unsubFocus(); };
	});

	// Below lg the preview pane is hidden, so single-tap navigation falls
	// through to edit when there's nothing to drill into.
	const hasPreviewPane = () =>
		typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;

	async function selectPage(colIndex: number, page: PageSummary) {
		const wasSelected = columns[colIndex]?.selectedRoute === page.route;

		// Without a preview pane, leaf pages have no useful "select" state —
		// open edit directly. For folders, re-tapping the already-selected
		// row also opens edit (the column is already drilled in below it).
		if (!hasPreviewPane()) {
			if (!page.has_children || wasSelected) {
				onEdit(pageApiRoute(page));
				return;
			}
		}

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
		loadPreview(pageApiRoute(page));

		// Persist selection path for reload restoration
		saveSelectionPath();
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
				return { route: c.selectedRoute!, title: page?.menu ?? page?.title ?? c.selectedRoute! };
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

	// --- Miller drag-and-drop handlers ---

	function millerDragStart(e: DragEvent, page: PageSummary, colIndex: number) {
		if (!reorderMode) return;
		dragPage = page;
		dragColIndex = colIndex;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', page.route);
		}
	}

	function millerDragOver(e: DragEvent, colIndex: number, index: number) {
		if (!reorderMode || !dragPage) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		dropTarget = { colIndex, index };
	}

	async function millerDrop(e: DragEvent, colIndex: number, targetIndex: number) {
		e.preventDefault();
		if (!dragPage || saving || dragColIndex === null) return;

		const page = dragPage;
		const sourceColIndex = dragColIndex;
		const col = columns[colIndex];
		const sourceCol = columns[sourceColIndex];

		dragPage = null;
		dragColIndex = null;
		dropTarget = null;

		if (sourceColIndex !== colIndex) {
			// Cross-column move: move to different parent
			const ops: ReorganizeOperation[] = [{
				route: page.route,
				parent: col.parentRoute,
				position: targetIndex + 1,
			}];

			saving = true;
			try {
				await reorganizePages(ops);
				toast.success(`Moved "${page.title}"`);
				// Reload both columns
				const [srcPages, dstPages] = await Promise.all([
					loadColumn(sourceCol.parentRoute),
					loadColumn(col.parentRoute),
				]);
				columns = columns.map((c, i) => {
					if (i === sourceColIndex) return { ...c, pages: srcPages };
					if (i === colIndex) return { ...c, pages: dstPages };
					return c;
				});
			} catch {
				toast.error(i18n.t('ADMIN_NEXT.PAGES.MOVE_FAILED'));
			} finally {
				saving = false;
			}
			return;
		}

		// Same column reorder
		const siblings = [...col.pages];
		const currentIndex = siblings.findIndex(s => s.route === page.route);
		if (currentIndex === -1 || currentIndex === targetIndex) return;

		const [moved] = siblings.splice(currentIndex, 1);
		siblings.splice(targetIndex, 0, moved);

		const ops: ReorganizeOperation[] = siblings.map((p, i) => ({
			route: p.route,
			position: i + 1,
		}));

		saving = true;
		try {
			await reorganizePages(ops);
			toast.success(`Reordered "${page.title}"`);
			// Update column in place
			columns = columns.map((c, i) =>
				i === colIndex ? { ...c, pages: siblings } : c
			);
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.PAGES.REORDER_FAILED'));
		} finally {
			saving = false;
		}
	}

	function millerDragEnd() {
		dragPage = null;
		dragColIndex = null;
		dropTarget = null;
	}

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
			<option value="default:asc">{i18n.t('ADMIN_NEXT.DASHBOARD.PRESET_DEFAULT')}</option>
			<option value="order:asc">{i18n.t('ADMIN_NEXT.PAGES.PAGES_MILLER_VIEW.FOLDER_ORDER')}</option>
			<option value="title:asc">{i18n.t('ADMIN_NEXT.PAGES.SORT_TITLE_AZ')}</option>
			<option value="title:desc">{i18n.t('ADMIN_NEXT.PAGES.SORT_TITLE_ZA')}</option>
			<option value="modified:desc">{i18n.t('ADMIN_NEXT.PAGES.SORT_NEWEST')}</option>
			<option value="modified:asc">{i18n.t('ADMIN_NEXT.PAGES.SORT_OLDEST')}</option>
			<option value="date:desc">{i18n.t('ADMIN_NEXT.PAGES.SORT_DATE_NEWEST')}</option>
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
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					{#each filterColumn(col.pages) as page, pageIndex (page.route)}
						{@const isSelected = col.selectedRoute === page.route}
					{@const isActive = isSelected && colIndex === activeColumnIndex}
					{@const isPath = isSelected && colIndex !== activeColumnIndex}
					{@const isDragged = dragPage?.route === page.route}
					{@const explicitFiles = page.explicit_language_files ?? []}
					{@const translatedKeys = page.translated_languages ? Object.keys(page.translated_languages) : []}
					{@const hasImplicitDefault = !!page.has_default_file && !!contentLang.defaultLang}
					{@const badgeKeys = hasImplicitDefault && !translatedKeys.includes(contentLang.defaultLang)
						? [contentLang.defaultLang, ...translatedKeys]
						: translatedKeys}
					{@const hasAnyContent = translatedKeys.length > 0 || hasImplicitDefault}
					{@const hasContentInLang = !lang
						|| translatedKeys.includes(lang)
						|| (hasImplicitDefault && lang === contentLang.defaultLang)}
					{@const isUntranslated = lang && hasAnyContent && !hasContentInLang}
					{#if reorderMode && dropTarget?.colIndex === colIndex && dropTarget?.index === pageIndex && !isDragged}
						<div class="mx-2 h-0.5 rounded bg-primary"></div>
					{/if}
					<div
							class="flex w-full items-center gap-1 border-b border-border/40 px-2 py-2 text-left transition-all
								{isDragged ? 'opacity-30' : ''}
								{isActive
									? 'bg-primary text-primary-foreground'
									: isPath
										? 'bg-accent text-accent-foreground'
										: 'text-foreground hover:bg-accent'}"
							draggable={reorderMode}
							ondragstart={(e) => millerDragStart(e, page, colIndex)}
							ondragover={(e) => millerDragOver(e, colIndex, pageIndex)}
							ondrop={(e) => millerDrop(e, colIndex, pageIndex)}
							ondragend={millerDragEnd}
						>
							{#if reorderMode}
								<span class="flex shrink-0 cursor-grab items-center text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing">
									<GripVertical size={12} />
								</span>
							{/if}
							<button
								class="flex min-w-0 flex-1 items-center gap-2 text-left"
								onmousedown={(e) => { if (e.detail > 1) e.preventDefault(); }}
								onclick={() => selectPage(colIndex, page)}
								ondblclick={() => { window.getSelection()?.removeAllRanges(); onEdit(pageApiRoute(page)); }}
							>
							{#if page.has_children}
								<Folder size={14} class="shrink-0 {isActive ? 'text-primary-foreground/80' : (page.visible ? 'text-primary' : 'text-muted-foreground')}" />
							{:else}
								<File size={14} class="shrink-0 {isActive ? 'text-primary-foreground/60' : (page.visible ? 'text-primary/70' : 'text-muted-foreground')}" />
							{/if}
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-1.5">
									<div class="truncate text-[13px] font-medium
										{isUntranslated ? (isActive ? 'text-primary-foreground/60 italic' : 'text-muted-foreground italic') : ''}">{page.menu}</div>
									{#if !page.published}
										<span
											class="inline-flex h-4 shrink-0 items-center rounded px-1 text-[9px] font-bold uppercase leading-none
												{isActive ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'}"
											title={i18n.t('ADMIN_NEXT.PAGES.PAGES_MILLER_VIEW.DRAFT_UNPUBLISHED')}
										>Draft</span>
									{/if}
									{#if lang && badgeKeys.length > 0}
										<TranslationBadges
											translated={badgeKeys}
											currentLang={explicitFiles.includes(lang) ? lang : undefined}
										/>
									{/if}
								</div>
								<div class="truncate text-[11px] {isActive ? 'text-primary-foreground/70' : 'text-muted-foreground'}">{page.route}</div>
							</div>
							{#if page.has_children}
								<ChevronRight size={12} class="shrink-0 {isActive ? 'text-primary-foreground/60' : 'text-muted-foreground/50'}" />
							{/if}
							</button>
						</div>
					{/each}

					{#if filterColumn(col.pages).length === 0}
						<div class="flex flex-1 items-center justify-center text-xs text-muted-foreground">
							{isSearching ? 'No matches' : 'Empty'}
						</div>
					{/if}
				{/if}
			</div>
		{/each}
	</div>

	<!-- Preview panel (lg+ only — below lg, single-tap on a leaf or
	     re-tap on the already-selected folder opens edit instead) -->
	{#if lastSelected}
		<div class="hidden w-80 shrink-0 overflow-y-auto border-l border-border bg-card lg:block">
			{#if previewLoading}
				<div class="flex h-full items-center justify-center">
					<Loader2 size={16} class="animate-spin text-muted-foreground" />
				</div>
			{:else if previewPage}
				<div class="p-5">
					<!-- Title & edit button -->
					<div class="flex items-start justify-between gap-2">
						<div class="min-w-0">
							<h3 class="text-base font-semibold text-foreground">{previewPage.title}</h3>
							<p class="mt-0.5 text-[11px] text-muted-foreground">{previewPage.route}</p>
						</div>
						<Button size="sm" onclick={() => onEdit(pageApiRoute(previewPage!))} class="shrink-0">
							<ExternalLink size={13} />
							Edit
						</Button>
					</div>

					<!-- Badges -->
					<div class="mt-3 flex flex-wrap gap-1.5">
						<Badge variant="outline">{previewPage.template}</Badge>
						{#if previewPage.published}
							<Badge variant="success">{i18n.t('ADMIN_NEXT.PAGES.PUBLISHED')}</Badge>
						{:else}
							<Badge variant="secondary">Draft</Badge>
						{/if}
						{#if previewPage.visible}
							<Badge variant="success">{i18n.t('ADMIN_NEXT.PAGES.PAGES_MILLER_VIEW.VISIBLE')}</Badge>
						{/if}
						{#if previewPage.has_children}
							<Badge variant="secondary">{i18n.t('ADMIN_NEXT.PAGES.PAGES_MILLER_VIEW.HAS_CHILDREN')}</Badge>
						{/if}
					</div>

					<!-- Metadata -->
					<dl class="mt-4 space-y-1.5 text-[12px]">
						<div class="flex justify-between">
							<dt class="text-muted-foreground">{i18n.t('ADMIN_NEXT.PAGES.HEADER_MODIFIED')}</dt>
							<dd class="text-foreground">{new Date(previewPage.modified).toLocaleString()}</dd>
						</div>
						{#if previewPage.language}
							<div class="flex justify-between">
								<dt class="text-muted-foreground">{i18n.t('ADMIN_NEXT.PAGES.INFO_LANGUAGE')}</dt>
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

					<!-- Content summary -->
					{#if previewPage.summary}
						<div class="mt-4 border-t border-border pt-4">
							<h4 class="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{i18n.t('ADMIN_NEXT.PAGES.PAGES_MILLER_VIEW.SUMMARY')}</h4>
							<div class="prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed text-foreground/80">
								{@html previewPage.summary}
							</div>
						</div>
					{/if}

					<!-- Media -->
					{#if previewPage.media && previewPage.media.length > 0}
						<div class="mt-4 border-t border-border pt-4">
							<h4 class="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Media ({previewPage.media.length})</h4>
							<div class="grid grid-cols-4 gap-1.5">
								{#each previewPage.media as m}
									{@const isImage = m.type?.startsWith('image/')}
									{@const thumbUrl = m.thumbnail_url ? `${auth.serverUrl}${m.thumbnail_url}` : null}
									<div
										class="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted/50"
										title="{m.filename} ({(m.size / 1024).toFixed(0)}KB)"
									>
										{#if isImage && thumbUrl}
											<img src={thumbUrl} alt={m.filename} class="h-full w-full object-cover" loading="lazy" />
										{:else}
											<div class="flex h-full w-full items-center justify-center text-[10px] font-medium text-muted-foreground">
												{m.filename.split('.').pop()?.toUpperCase()}
											</div>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/if}

				</div>
			{/if}
		</div>
	{/if}
</div>
