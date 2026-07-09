<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { getPage, getPagesList, reorganizePages, pageApiRoute, parentRouteOf } from '$lib/api/endpoints/pages';
	import type { PageSummary, PageDetail, ReorganizeOperation } from '$lib/api/endpoints/pages';
	import { auth } from '$lib/stores/auth.svelte';
	import { invalidations } from '$lib/stores/invalidation.svelte';
	import { onMount, tick, untrack } from 'svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import TranslationBadges from '$lib/components/ui/TranslationBadges.svelte';
	import { contentLang } from '$lib/stores/contentLang.svelte';
	import { toast } from 'svelte-sonner';
	import {
		Folder, File, Loader2, ExternalLink, ArrowUpDown, GripVertical, Copy, Trash2,
		CircleCheck, CircleDashed
	} from 'lucide-svelte';
	import DirectionalIcon from '$lib/components/ui/DirectionalIcon.svelte';
	import { prefs } from '$lib/stores/preferences.svelte';
	import { pagesChunks, streamKey, type StreamConfig } from '$lib/stores/pagesChunks.svelte';
	import { emptyPageFilters, pageFilterStreamFields, type PageFilters } from '$lib/utils/pageFilters';

	type SortField = 'default' | 'order' | 'title' | 'modified' | 'date';

	interface Props {
		searchQuery?: string;
		filters?: PageFilters;
		reorderMode?: boolean;
		lang?: string;
		onEdit: (route: string) => void;
		onDelete?: (page: PageSummary) => void;
		/**
		 * Resolves to the duplicated page when the copy succeeds, or `null`
		 * on failure. The columns view uses the return value to re-select
		 * the new row once it lands; list/tree just ignore it.
		 */
		onCopy?: (page: PageSummary) => Promise<PageDetail | null>;
		onTogglePublished?: (page: PageSummary) => void;
		copyingRoutes?: Set<string>;
	}

	let { searchQuery = '', filters = emptyPageFilters(), reorderMode = false, lang, onEdit, onDelete, onCopy, onTogglePublished, copyingRoutes }: Props = $props();

	// Stable key over the active filters. Changing a filter re-points every open
	// column at a fresh, unloaded stream (the stream key already includes the
	// filter fields), so re-bootstrap each open column under the new query.
	const filterKey = $derived(JSON.stringify(pageFilterStreamFields(filters)));
	let prevFilterKey = filterKey;
	$effect(() => {
		if (filterKey === prevFilterKey) return;
		prevFilterKey = filterKey;
		untrack(() => {
			for (const col of columns) bootstrapColumn(col.parentRoute);
		});
	});

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

	/**
	 * A column's structure: just the parent route and the user's selection.
	 * The actual page data lives in the chunk store, keyed by streamKey
	 * derived from parent + sort + lang + chunk size. Columns persist across
	 * navigation (we never evict the chunk store), so backing up the
	 * breadcrumb stays instant.
	 */
	interface Column {
		parentRoute: string;
		selectedRoute: string | null;
	}

	let columns = $state<Column[]>([]);
	let previewPage = $state<PageDetail | null>(null);
	let previewLoading = $state(false);

	// Per-column chunk size — captured at column creation so changing the
	// toolbar dropdown mid-navigation doesn't blow away already-loaded
	// chunks. Each new column uses the current dropdown value.
	const chunkSize = $derived(prefs.pagesChunkSize);

	function streamConfigFor(parentRoute: string): StreamConfig {
		return {
			children_of: parentRoute,
			sort: sortField,
			order: sortOrder,
			lang: lang || undefined,
			translations: lang ? true : undefined,
			...pageFilterStreamFields(filters),
		};
	}

	function streamKeyFor(parentRoute: string): string {
		return streamKey(streamConfigFor(parentRoute), chunkSize);
	}

	/**
	 * Bootstrap the chunk stream for a parent route. Returns once the first
	 * chunk has resolved (or already exists), so the caller can inspect
	 * `total` to decide whether to drill further.
	 *
	 * `ensureChunkForIndex` reads tracked store fields (`s.loading[page]`,
	 * `s.chunks[page]`) to dedupe, and those same fields are written when
	 * the fetch settles — calling this directly inside an `$effect` would
	 * register those fields as deps and re-fire the effect on every chunk
	 * write. We always invoke this through `untrack(...)` from effects.
	 */
	async function bootstrapColumn(parentRoute: string): Promise<void> {
		try {
			await pagesChunks.ensureChunkForIndex(
				streamKeyFor(parentRoute),
				streamConfigFor(parentRoute),
				chunkSize,
				0,
			);
		} catch { /* error surfaced by toast at the API client layer */ }
	}

	/**
	 * Return all rows currently loaded for a column (in absolute order),
	 * skipping unloaded chunks. Used by reorder code that needs the full
	 * sibling list — callers should first call ensureAllChunks to
	 * guarantee completeness.
	 */
	function loadedPagesFor(parentRoute: string): PageSummary[] {
		const key = streamKeyFor(parentRoute);
		const total = pagesChunks.getTotal(key);
		if (total === null || total === 0) return [];
		const out: PageSummary[] = [];
		for (let i = 0; i < total; i++) {
			const r = pagesChunks.getRow(key, i);
			if (r) out.push(r);
		}
		return out;
	}

	function handleSortChange(e: Event) {
		const val = (e.target as HTMLSelectElement).value;
		const [field, order] = val.split(':') as [SortField, 'asc' | 'desc'];
		sortField = field;
		sortOrder = order;
		// Reset to root column with new sort. The chunk store automatically
		// uses the new streamKey; old streams stay cached.
		columns = [{ parentRoute: '/', selectedRoute: null }];
		previewPage = null;
		bootstrapColumn('/');
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

	/**
	 * Restore the breadcrumb path saved in sessionStorage. For each level we
	 * use the server's `?locate=` parameter to fetch the specific chunk
	 * containing the selected page — that avoids walking every chunk on a
	 * 1000-child folder just to find row #800 of the saved path.
	 */
	async function restoreColumns(savedPath: string[]) {
		const result: Column[] = [{ parentRoute: '/', selectedRoute: null }];

		// Bootstrap root chunk first so we know its total / can find the saved
		// selection inside it.
		await bootstrapColumn('/');

		for (const route of savedPath) {
			const lastCol = result[result.length - 1];
			const parentKey = streamKeyFor(lastCol.parentRoute);
			// Pull the chunk containing this route — usually returns chunk 1
			// for small folders, or the relevant deep chunk for large ones.
			try {
				const idx = await pagesChunks.ensureChunkForRoute(
					parentKey,
					streamConfigFor(lastCol.parentRoute),
					chunkSize,
					route,
				);
				if (idx === null) break; // page no longer exists
				const page = pagesChunks.getRow(parentKey, idx);
				if (!page) break;
				lastCol.selectedRoute = route;
				if (page.has_children) {
					result.push({ parentRoute: route, selectedRoute: null });
					await bootstrapColumn(route);
				}
			} catch {
				break;
			}
		}

		columns = result;

		// Load preview for last selected
		const lastRoute = savedPath[savedPath.length - 1];
		if (lastRoute && result.some(c => c.selectedRoute === lastRoute)) {
			loadPreview(lastRoute);
		}

		// Scroll every column to its selected row so the user lands on the
		// restored path instead of at the top of each column. Wait one tick
		// + a rAF: tick flushes the Svelte microtask queue, the frame gives
		// the layout engine a chance to size newly-mounted chunks so our
		// row.getBoundingClientRect() reads the final position.
		await tick();
		await new Promise(res => requestAnimationFrame(() => res(null)));
		scrollSelectedRowsIntoView();
	}

	/**
	 * For each column with a selectedRoute, scroll the column so the
	 * selected row sits at the top of its visible area. Cheap and idempotent
	 * — call it whenever the layout could leave a selected row off-screen.
	 */
	function scrollSelectedRowsIntoView(): void {
		const cols = document.querySelectorAll<HTMLElement>('[data-miller-column]');
		cols.forEach((colEl, i) => {
			const sel = columns[i]?.selectedRoute;
			if (!sel) return;
			const row = colEl.querySelector<HTMLElement>(`[data-page-route="${CSS.escape(sel)}"]`);
			if (!row) return;
			const colRect = colEl.getBoundingClientRect();
			const rowRect = row.getBoundingClientRect();
			colEl.scrollTop += rowRect.top - colRect.top - 4;
		});
	}

	// Initialize with root, reload when lang changes
	let prevLang = lang;
	$effect(() => {
		if (lang !== prevLang) {
			prevLang = lang;
			previewPage = null;
			allPagesCache = null;
		}
		const savedPath = untrack(getSavedPath);
		// All chunk-store calls run untracked: see comment on bootstrapColumn
		// for why. The effect's reactive deps must be limited to `lang`.
		untrack(() => {
			if (savedPath.length > 0) {
				restoreColumns(savedPath);
			} else {
				columns = [{ parentRoute: '/', selectedRoute: null }];
				bootstrapColumn('/');
			}
		});
	});

	// Silent targeted refresh: the chunk store already drops every cached
	// chunk on `pages:*` events. All that's left is to nudge the active
	// columns' first chunks back into memory so the user doesn't see empty
	// columns briefly.
	function silentRefreshColumn(parentRoute: string) {
		bootstrapColumn(parentRoute);
	}

	onMount(() => {
		const onPages = (e: { id?: string; action?: string }) => {
			allPagesCache = null;
			// Drop a stale preview when the previewed page was just deleted
			// or moved out from under us — otherwise the right pane keeps
			// showing the now-gone page until the user clicks elsewhere.
			// This matters more now that Delete is reachable from inside the
			// preview itself; without this the user clicks Trash and the
			// preview just stays there.
			if (e.id && previewPage && (e.action === 'delete' || e.action === 'move')) {
				if (e.id === previewPage.route || e.id === `/${previewPage.route.replace(/^\//, '')}`) {
					previewPage = null;
				}
			}
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
		// Identify the page by its api route, not its public route. The home
		// page's public route is `/`, which collides with the root column's
		// parent marker — using it would push a child column keyed to root
		// (re-listing the top-level pages instead of the home's modules) and
		// duplicate the breadcrumb. `pageApiRoute` returns the rawRoute
		// (e.g. `/home`), keeping every column/selection key unique.
		const apiRoute = pageApiRoute(page);
		const wasSelected = columns[colIndex]?.selectedRoute === apiRoute;

		// Without a preview pane, leaf pages have no useful "select" state —
		// open edit directly. For folders, re-tapping the already-selected
		// row also opens edit (the column is already drilled in below it).
		if (!hasPreviewPane()) {
			if (!page.has_children || wasSelected) {
				onEdit(apiRoute);
				return;
			}
		}

		// Update selection in current column, trim columns after
		const updated = columns.slice(0, colIndex + 1);
		updated[colIndex] = { ...updated[colIndex], selectedRoute: apiRoute };

		if (page.has_children) {
			updated.push({ parentRoute: apiRoute, selectedRoute: null });
			columns = updated;
			// Kick off the chunk-store bootstrap for the new column. The
			// derived rendering picks up the chunks as they arrive.
			bootstrapColumn(apiRoute);
		} else {
			columns = updated;
		}

		// Always load preview for selected page
		loadPreview(pageApiRoute(page));

		// Persist selection path for reload restoration
		saveSelectionPath();
	}

	/**
	 * Copy the previewed page via the parent's `onCopy`, then move selection
	 * onto the duplicated row inside the same column. We can't search the
	 * chunk store yet (the X-Invalidates refresh is in flight), but
	 * `selectPage` only needs a PageSummary-shaped object and uses its route
	 * for the highlight — the chunk-driven render lights it up as soon as the
	 * refreshed page list arrives. Stops at toast/stats if the copy failed.
	 */
	async function handlePreviewCopy() {
		if (!previewPage || !onCopy) return;
		const source = previewPage;
		const newPage = await onCopy(source);
		if (!newPage) return;
		const parentOfNew = parentRouteOf(pageApiRoute(newPage));
		const colIndex = columns.findIndex((c) => c.parentRoute === parentOfNew);
		if (colIndex >= 0) {
			selectPage(colIndex, newPage);
		} else {
			// Source was off-screen (deep tree, parent column scrolled away)
			// — surface the new page in the preview pane regardless.
			previewPage = newPage;
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

	/**
	 * Look up a page summary in this column's chunk store. Walks the loaded
	 * chunks; returns null if the row isn't resident yet. Used only for
	 * display lookups (breadcrumb, selection title) — the chunk store will
	 * usually have the chunk containing any selected row because selection
	 * happens from a visible row.
	 */
	function findInColumn(parentRoute: string, route: string): PageSummary | null {
		const key = streamKeyFor(parentRoute);
		const total = pagesChunks.getTotal(key);
		if (total === null) return null;
		for (let i = 0; i < total; i++) {
			const r = pagesChunks.getRow(key, i);
			// `route` is an api route (see selectPage), so match on the row's
			// api route too — the home page's public route `/` would never
			// match its `/home` selection key otherwise.
			if (r && pageApiRoute(r) === route) return r;
		}
		return null;
	}

	// Breadcrumb from column selections
	const breadcrumb = $derived(
		columns
			.filter(c => c.selectedRoute)
			.map(c => {
				const page = findInColumn(c.parentRoute, c.selectedRoute!);
				return { route: c.selectedRoute!, title: page?.title ?? c.selectedRoute! };
			})
	);

	// Get the last selected page summary
	const lastSelected = $derived.by(() => {
		for (let i = columns.length - 1; i >= 0; i--) {
			const sel = columns[i].selectedRoute;
			if (sel) return findInColumn(columns[i].parentRoute, sel);
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

		// Reorganize must reflect the FULL sibling list. Ensure both columns
		// are fully resident before sending positions — otherwise unloaded
		// chunks would be excluded from the operation list and silently
		// drop out of order.
		await Promise.all([
			pagesChunks.ensureAllChunks(streamKeyFor(sourceCol.parentRoute), streamConfigFor(sourceCol.parentRoute), chunkSize),
			pagesChunks.ensureAllChunks(streamKeyFor(col.parentRoute), streamConfigFor(col.parentRoute), chunkSize),
		]);

		const targetPages = loadedPagesFor(col.parentRoute);

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
			const targetSiblings = [...targetPages];
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
				// The chunk store auto-invalidates on `pages:*`; the
				// bootstrap effect re-fires.
			} catch {
				toast.error(i18n.t('ADMIN_NEXT.PAGES.MOVE_FAILED'));
			} finally {
				saving = false;
			}
			return;
		}

		// Same column reorder
		const siblings = [...targetPages];
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

	// Reorder mode requires the full sibling list of every visible column —
	// see millerDrop for why. Force-load on toggle on, AND whenever the user
	// drills into a new column while reorder stays on.
	$effect(() => {
		if (!reorderMode) return;
		// Capture deps on `columns` and `chunkSize` for re-fire, but call
		// the store untracked so chunk-load writes don't loop the effect.
		const snapshot = columns.map(c => c.parentRoute);
		const size = chunkSize;
		untrack(() => {
			for (const parentRoute of snapshot) {
				pagesChunks.ensureAllChunks(
					streamKeyFor(parentRoute),
					streamConfigFor(parentRoute),
					size,
				);
			}
		});
	});

	interface ChunkBlock {
		page: number;
		startIndex: number;
		count: number;
		loaded: boolean;
		rows: PageSummary[];
	}

	/**
	 * Build the chunk-block layout for a column given its parent route. Each
	 * block either has loaded rows or represents an unloaded chunk that the
	 * IntersectionObserver placeholder will request when scrolled near.
	 */
	function chunkBlocksFor(parentRoute: string): ChunkBlock[] {
		const key = streamKeyFor(parentRoute);
		const total = pagesChunks.getTotal(key);
		if (total === null || total === 0) return [];
		const blocks: ChunkBlock[] = [];
		const totalPages = Math.ceil(total / chunkSize);
		for (let page = 1; page <= totalPages; page++) {
			const startIndex = (page - 1) * chunkSize;
			const count = Math.min(chunkSize, total - startIndex);
			const loaded = pagesChunks.isChunkLoaded(key, startIndex);
			const rows: PageSummary[] = [];
			if (loaded) {
				for (let i = 0; i < count; i++) {
					const r = pagesChunks.getRow(key, startIndex + i);
					if (r) rows.push(r);
				}
			}
			blocks.push({ page, startIndex, count, loaded, rows });
		}
		return blocks;
	}

	/**
	 * Per-column IntersectionObserver action. Scoped to the column's scroll
	 * container so trigger thresholds are correct even when other columns
	 * have different scroll positions. Also nudges the chunk above and below
	 * for symmetric "preload as you approach" behaviour.
	 */
	function observeChunkPlaceholder(
		node: HTMLElement,
		params: { startIndex: number; parentRoute: string },
	) {
		let current = params;
		const colEl = node.closest<HTMLElement>('[data-miller-column]');
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;
					const idx = current.startIndex;
					const pp = chunkSize;
					const cfg = streamConfigFor(current.parentRoute);
					const key = streamKeyFor(current.parentRoute);
					pagesChunks.ensureChunkForIndex(key, cfg, pp, idx);
					if (idx >= pp) pagesChunks.ensureChunkForIndex(key, cfg, pp, idx - pp);
					pagesChunks.ensureChunkForIndex(key, cfg, pp, idx + pp);
				}
			},
			{ root: colEl, rootMargin: '1500px 0px' },
		);
		observer.observe(node);
		return {
			update(next: { startIndex: number; parentRoute: string }) {
				current = next;
			},
			destroy() { observer.disconnect(); },
		};
	}

	// Rough per-row height for placeholder sizing inside a column. Miller
	// rows are tighter than list rows because the column is narrower.
	const COL_ROW_HEIGHT_PX = 44;
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
		{#each columns as col, colIndex (col.parentRoute)}
			{@const colKey = streamKeyFor(col.parentRoute)}
			{@const colTotal = pagesChunks.getTotal(colKey)}
			{@const colBlocks = chunkBlocksFor(col.parentRoute)}
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
				{#if colTotal === null}
					<div class="flex flex-1 items-center justify-center">
						<Loader2 size={16} class="animate-spin text-muted-foreground" />
					</div>
				{:else if colTotal === 0}
					<div class="flex flex-1 items-center justify-center text-xs text-muted-foreground">
						{isSearching ? 'No matches' : 'Empty'}
					</div>
				{:else}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					{#each colBlocks as block (block.page)}
						{#if block.loaded}
							{#each filterColumn(block.rows) as page (page.route)}
								{@const isSelected = col.selectedRoute === pageApiRoute(page)}
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
									data-page-route={page.route}
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
						{:else}
							<div
								class="flex items-center justify-center border-b border-border/40 text-[0.6875rem] text-muted-foreground/60"
								style="min-height: {block.count * COL_ROW_HEIGHT_PX}px;"
								use:observeChunkPlaceholder={{ startIndex: block.startIndex, parentRoute: col.parentRoute }}
							>
								<Loader2 size={12} class="me-1.5 animate-spin" />
								{i18n.t('ADMIN_NEXT.PAGES.LOADING_CHUNK', { from: block.startIndex + 1, to: block.startIndex + block.count })}
							</div>
						{/if}
					{/each}

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
				{@const copyingPreview = copyingRoutes?.has(previewPage.route) ?? false}
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

					<!-- Badges + row-level actions. The preview header is too
					     narrow to fit Copy/Delete next to the Edit pill on most
					     screen widths, so the state badges stay flush start and
					     the action icons sit at the row's end edge — separated
					     by `ms-auto` rather than a divider to keep the visual
					     noise low while still distinguishing state from action. -->
					<div class="mt-3 flex flex-wrap items-center gap-1.5">
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
						{#if onCopy || onDelete || onTogglePublished}
							<div class="ms-auto inline-flex items-center gap-1">
								{#if onTogglePublished}
									<button
										type="button"
										class="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
										onclick={() => onTogglePublished(previewPage as unknown as PageSummary)}
										title={previewPage.published ? i18n.t('ADMIN_NEXT.PAGES.UNPUBLISH') : i18n.t('ADMIN_NEXT.PAGES.PUBLISH')}
										aria-label={previewPage.published ? i18n.t('ADMIN_NEXT.PAGES.UNPUBLISH') : i18n.t('ADMIN_NEXT.PAGES.PUBLISH')}
									>
										{#if previewPage.published}
											<CircleCheck size={13} class="text-green-500" />
										{:else}
											<CircleDashed size={13} />
										{/if}
									</button>
								{/if}
								{#if onCopy}
									<button
										type="button"
										class="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
										onclick={handlePreviewCopy}
										disabled={copyingPreview}
										title={i18n.t('ADMIN_NEXT.PAGES.EDIT.COPY_PAGE')}
										aria-label={i18n.t('ADMIN_NEXT.PAGES.EDIT.COPY_PAGE')}
									>
										{#if copyingPreview}
											<Loader2 size={13} class="animate-spin" />
										{:else}
											<Copy size={13} />
										{/if}
									</button>
								{/if}
								{#if onDelete}
									<button
										type="button"
										class="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
										onclick={() => onDelete(previewPage!)}
										title={i18n.t('ADMIN_NEXT.DELETE')}
										aria-label={i18n.t('ADMIN_NEXT.DELETE')}
									>
										<Trash2 size={13} />
									</button>
								{/if}
							</div>
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
							<div class="max-w-none text-[0.8125rem] leading-relaxed text-foreground/80">
								{previewPage.summary}
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

