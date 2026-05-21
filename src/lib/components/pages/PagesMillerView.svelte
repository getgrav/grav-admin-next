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
		Folder, File, Loader2, ExternalLink, ArrowUpDown, GripVertical
	} from 'lucide-svelte';
	import DirectionalIcon from '$lib/components/ui/DirectionalIcon.svelte';

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

	/**
	 * Global cursor tracking during a Miller drag.
	 *
	 * Per-element (row or column) ondragover handlers fire inconsistently
	 * across columns when each column is its own overflow-y-auto scroll
	 * container — notably the root column when it's packed with rows. WebKit
	 * / Chromium will happily fire dragover on the source column (where the
	 * drag started) but skip identical handlers on sibling columns.
	 *
	 * The window-level dragover event, in contrast, fires continuously during
	 * any HTML5 drag regardless of cursor position or which element is under
	 * it. We use it as the single source of truth for dropTarget: look up
	 * which column rect the cursor is in via data-miller-column, then compute
	 * the insertion index from cursor Y vs each row's getBoundingClientRect
	 * midpoint (data-miller-row). preventDefault() inside a column tells the
	 * browser that drops are allowed there — so column-level ondrop fires.
	 */

	/**
	 * Compute the insertion index inside a column from the cursor's Y position.
	 * Skips rows that are entirely outside the column's visible rect so that
	 * scrolled-away rows don't poison the result.
	 */
	function computeIndexFromCursor(colEl: HTMLElement, clientY: number): number {
		const colRect = colEl.getBoundingClientRect();
		const rows = Array.from(colEl.querySelectorAll<HTMLElement>('[data-miller-row]'));
		let lastVisibleIndex = -1;
		for (let i = 0; i < rows.length; i++) {
			const r = rows[i].getBoundingClientRect();
			if (r.bottom < colRect.top) continue;     // scrolled above
			if (r.top > colRect.bottom) break;        // scrolled below
			lastVisibleIndex = i;
			if (clientY < r.top + r.height / 2) {
				return i;
			}
		}
		// Below every visible row: snap to "after the last visible row".
		return lastVisibleIndex >= 0 ? lastVisibleIndex + 1 : rows.length;
	}

	// Floating indicator geometry — snapped to a row boundary so visually
	// it looks identical to the tree/list view's between-rows purple line,
	// but rendered via position: fixed so it always paints in every column
	// (Chromium throttles inline re-renders in passive columns during a
	// drag, which is why earlier inline-only attempts failed to show the
	// indicator in columns left of the drag source).
	let indicator = $state<{ left: number; top: number; width: number } | null>(null);

	function updateIndicator(colEl: HTMLElement, index: number) {
		const colRect = colEl.getBoundingClientRect();
		const rows = Array.from(colEl.querySelectorAll<HTMLElement>('[data-miller-row]'));
		let top: number;
		if (index < rows.length) {
			top = rows[index].getBoundingClientRect().top;
		} else if (rows.length > 0) {
			top = rows[rows.length - 1].getBoundingClientRect().bottom;
		} else {
			top = colRect.top;
		}
		// Keep within the visible column so the line doesn't render outside
		// the column's clipping rect (e.g. when target row is scrolled away).
		top = Math.max(colRect.top, Math.min(colRect.bottom, top));
		indicator = { left: colRect.left + 8, top, width: colRect.width - 16 };
	}

	function setDropTargetFromEvent(e: DragEvent, colEl: HTMLElement) {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		const colIndex = Number(colEl.getAttribute('data-miller-column'));
		const index = computeIndexFromCursor(colEl, e.clientY);
		dropTarget = { colIndex, index };
		updateIndicator(colEl, index);

		// Auto-scroll near the column's top/bottom edges so the user can drag
		// into rows that are currently scrolled out of view.
		const rect = colEl.getBoundingClientRect();
		const EDGE = 48;
		const STEP = 10;
		if (e.clientY < rect.top + EDGE) {
			colEl.scrollTop = Math.max(0, colEl.scrollTop - STEP);
		} else if (e.clientY > rect.bottom - EDGE) {
			colEl.scrollTop = colEl.scrollTop + STEP;
		}
	}

	function handleWindowDragOver(e: DragEvent) {
		if (!reorderMode || !dragPage) return;
		const cols = document.querySelectorAll<HTMLElement>('[data-miller-column]');
		for (const colEl of cols) {
			const rect = colEl.getBoundingClientRect();
			if (e.clientX < rect.left || e.clientX > rect.right) continue;
			if (e.clientY < rect.top || e.clientY > rect.bottom) continue;
			setDropTargetFromEvent(e, colEl);
			return;
		}
		dropTarget = null;
		indicator = null;
	}

	// Per-column fallback: fires when the cursor is directly over the column
	// container. Redundant with window dragover; either path is sufficient.
	function millerColumnDragOver(e: DragEvent, colIndex: number) {
		if (!reorderMode || !dragPage) return;
		setDropTargetFromEvent(e, e.currentTarget as HTMLElement);
	}

	// Per-row fallback: fires when the cursor is over a specific row.
	// Computes via the row's parent column so the same logic applies.
	function millerRowDragOver(e: DragEvent) {
		if (!reorderMode || !dragPage) return;
		const rowEl = e.currentTarget as HTMLElement;
		const colEl = rowEl.closest<HTMLElement>('[data-miller-column]');
		if (!colEl) return;
		setDropTargetFromEvent(e, colEl);
	}

	function millerColumnDrop(e: DragEvent, colIndex: number) {
		if (!reorderMode || !dragPage) return;
		e.preventDefault();
		const index = dropTarget?.colIndex === colIndex ? dropTarget.index : 0;
		millerDrop(e, colIndex, index);
	}

	$effect(() => {
		// Always attach the window listener; the handler exits early if
		// reorderMode is off or no drag is in flight. Attaching unconditionally
		// avoids races where reorderMode flips on after a render cycle.
		window.addEventListener('dragover', handleWindowDragOver);
		return () => window.removeEventListener('dragover', handleWindowDragOver);
	});

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
		indicator = null;

		if (sourceColIndex !== colIndex) {
			// Cross-column move: relocate to a new parent and renumber ALL
			// target-parent siblings to honor the user's drop position.
			//
			// We renumber unconditionally (rather than only when the target
			// is already ordered). If the target is unordered, sending the
			// moved page with a position would land it wherever its slug
			// alphabetizes — not where the indicator showed. Forcing every
			// target sibling into the visually-implied position is the only
			// way to make the drop WYSIWYG. The side effect is that target
			// siblings without NN. prefixes get them; routes are unchanged.
			const targetSiblings = [...col.pages];
			targetSiblings.splice(targetIndex, 0, page);

			const ops: ReorganizeOperation[] = targetSiblings.map((p, i) => {
				const isMoved = p.route === page.route;
				return isMoved
					? { route: page.route, parent: col.parentRoute, position: i + 1 }
					: { route: p.route, position: i + 1 };
			});

			saving = true;
			try {
				await reorganizePages(ops);
				toast.success(i18n.t('ADMIN_NEXT.TOASTS.ITEM_MOVED', { name: page.title }));
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
		// targetIndex is computed from cursor position against the ORIGINAL
		// (unmodified) sibling list — it's the index of the row the user
		// wants the dragged page to land BEFORE. After we splice the source
		// out, every position to the right shifts left by one, so for a
		// forward move (currentIndex < targetIndex) we re-insert at
		// targetIndex - 1 to match the user's visual intent. Otherwise the
		// dragged page ends up one slot below where the indicator showed.
		if (currentIndex === -1) return;
		const insertAt = currentIndex < targetIndex ? targetIndex - 1 : targetIndex;
		if (currentIndex === insertAt) return;

		const [moved] = siblings.splice(currentIndex, 1);
		siblings.splice(insertAt, 0, moved);

		const ops: ReorganizeOperation[] = siblings.map((p, i) => ({
			route: p.route,
			position: i + 1,
		}));

		saving = true;
		try {
			await reorganizePages(ops);
			toast.success(i18n.t('ADMIN_NEXT.TOASTS.ITEM_REORDERED', { name: page.title }));
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
		indicator = null;
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
<div class="flex items-center gap-1 border-b border-border px-4 py-2 text-[0.75rem]">
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
		<DirectionalIcon name="chevron-forward" size={11} class="text-muted-foreground/50" />
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

	<div class="ms-auto flex items-center gap-1.5 text-muted-foreground">
		<ArrowUpDown size={11} />
		<select
			class="h-6 rounded border-0 bg-transparent pe-6 text-[0.6875rem] font-medium focus:outline-none focus:ring-0"
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
			{@const colEndIndex = filterColumn(col.pages).length}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<!--
				data-miller-column is read by the window-level dragover handler
				(handleWindowDragOver) to find which column the cursor is in
				and compute the insertion index. The column doesn't need its
				own ondragover — window covers all positions reliably — but it
				does need ondrop because drop events still fire per-element.
			-->
			<div
				data-miller-column={colIndex}
				class="flex w-56 shrink-0 flex-col overflow-y-auto border-e border-border {colIndex < columns.length - 1 ? 'bg-muted/30' : ''}"
				ondragover={(e) => millerColumnDragOver(e, colIndex)}
				ondrop={(e) => millerColumnDrop(e, colIndex)}
			>
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
					<div
							data-miller-row
							class="flex w-full items-center gap-1 border-b border-border/40 px-2 py-2 text-start transition-all
								{isDragged ? 'opacity-30' : ''}
								{isActive
									? 'bg-primary text-primary-foreground'
									: isPath
										? 'bg-accent text-accent-foreground'
										: 'text-foreground hover:bg-accent'}"
							draggable={reorderMode}
							ondragstart={(e) => millerDragStart(e, page, colIndex)}
							ondragover={millerRowDragOver}
							ondragend={millerDragEnd}
						>
							{#if reorderMode}
								<span class="flex shrink-0 cursor-grab items-center text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing">
									<GripVertical size={12} />
								</span>
							{/if}
							<button
								class="flex min-w-0 flex-1 items-center gap-2 text-start"
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
									<div class="truncate text-[0.8125rem] font-medium
										{isUntranslated ? (isActive ? 'text-primary-foreground/60 italic' : 'text-muted-foreground italic') : ''}">{page.title}</div>
									{#if !page.published}
										<span
											class="inline-flex h-4 shrink-0 items-center rounded px-1 text-[0.5625rem] font-bold uppercase leading-none
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
								<div class="truncate text-[0.6875rem] {isActive ? 'text-primary-foreground/70' : 'text-muted-foreground'}">{page.route}</div>
							</div>
							{#if page.has_children}
								<DirectionalIcon name="chevron-forward" size={12} class="shrink-0 {isActive ? 'text-primary-foreground/60' : 'text-muted-foreground/50'}" />
							{/if}
							</button>
						</div>
					{/each}

					{#if filterColumn(col.pages).length === 0 && !reorderMode}
						<div class="flex flex-1 items-center justify-center text-xs text-muted-foreground">
							{isSearching ? 'No matches' : 'Empty'}
						</div>
					{/if}

					<!-- Filler: ensures the column has enough vertical extent
					     for cursor tracking to detect "cursor is in this
					     column" even when there are few rows. Transparent. -->
					<div class="flex-1 min-h-16"></div>
				{/if}
			</div>
		{/each}
	</div>

	<!-- Preview panel (lg+ only — below lg, single-tap on a leaf or
	     re-tap on the already-selected folder opens edit instead) -->
	{#if lastSelected}
		<div class="hidden w-80 shrink-0 overflow-y-auto border-s border-border bg-card lg:block">
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
							<p class="mt-0.5 text-[0.6875rem] text-muted-foreground">{previewPage.route}</p>
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
					<dl class="mt-4 space-y-1.5 text-[0.75rem]">
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
							<h4 class="mb-2 text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">{i18n.t('ADMIN_NEXT.PAGES.PAGES_MILLER_VIEW.SUMMARY')}</h4>
							<div class="prose prose-sm dark:prose-invert max-w-none text-[0.8125rem] leading-relaxed text-foreground/80">
								{@html previewPage.summary}
							</div>
						</div>
					{/if}

					<!-- Media -->
					{#if previewPage.media && previewPage.media.length > 0}
						<div class="mt-4 border-t border-border pt-4">
							<h4 class="mb-2 text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">Media ({previewPage.media.length})</h4>
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
											<div class="flex h-full w-full items-center justify-center text-[0.625rem] font-medium text-muted-foreground">
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

<!-- Drop indicator: same thin purple line as the tree/list views' inline
     between-row indicators, but rendered via position: fixed and snapped
     to the target row's top (or last row's bottom for end-of-column).
     Using fixed positioning sidesteps the Chromium repaint throttling
     that prevented inline indicators from showing up in columns left of
     the drag source — a fixed-position element always paints. -->
{#if reorderMode && dragPage && indicator}
	<div
		class="pointer-events-none fixed z-50 h-0.5 rounded bg-primary"
		style="top: {indicator.top - 1}px; left: {indicator.left}px; width: {indicator.width}px;"
	></div>
{/if}

