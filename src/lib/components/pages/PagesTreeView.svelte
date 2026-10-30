<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { linkClick } from '$lib/utils/navLink';
	import { pageEditUrl } from '$lib/utils/pageEditUrl';
	import { pageLabel, pageTitleIfDifferent } from '$lib/utils/page-label';
	import { pageCan } from '$lib/utils/permissions';
	import { reorganizePages, pageApiRoute, parentRouteOf } from '$lib/api/endpoints/pages';
	import { createPageSearch } from '$lib/utils/page-search.svelte';
	import type { PageSummary, PageDetail } from '$lib/api/endpoints/pages';
	import { buildMoveOps, fullInsertIndex, isWithin, landingIndex, orderNumber } from '$lib/utils/reorganize-ops';
	import { invalidations } from '$lib/stores/invalidation.svelte';
	import { onMount, tick, untrack } from 'svelte';
	import { Badge } from '$lib/components/ui/badge';
	import TranslationBadges from '$lib/components/ui/TranslationBadges.svelte';
	import PageStatusIndicator from '$lib/components/pages/PageStatusIndicator.svelte';
	import { pageStatusToggleLabel } from '$lib/utils/pageStatus';
	import { contentLang } from '$lib/stores/contentLang.svelte';
	import { toast } from 'svelte-sonner';
	import {
		ChevronDown, FolderOpen, Folder, File, Loader2, Trash2, Copy,
		ArrowUp, ArrowDown, GripVertical
	} from 'lucide-svelte';
	import DirectionalIcon from '$lib/components/ui/DirectionalIcon.svelte';
	import { prefs } from '$lib/stores/preferences.svelte';
	import { pagesChunks, streamKey, type StreamConfig } from '$lib/stores/pagesChunks.svelte';
	import { emptyPageFilters, pageFilterStreamFields, type PageFilters } from '$lib/utils/pageFilters';
	import { toggleFolder } from '$lib/utils/tree-expand';

	type SortField = 'default' | 'order' | 'title' | 'modified' | 'date' | 'slug';

	interface Props {
		searchQuery?: string;
		filters?: PageFilters;
		reorderMode?: boolean;
		lang?: string;
		onEdit: (route: string) => void;
		onDelete?: (page: PageSummary) => void;
		onCopy?: (page: PageSummary) => Promise<PageDetail | null> | void;
		onTogglePublished?: (page: PageSummary) => void;
		copyingRoutes?: Set<string>;
	}

	let { searchQuery = '', filters = emptyPageFilters(), reorderMode = false, lang, onEdit, onDelete, onCopy, onTogglePublished, copyingRoutes }: Props = $props();

	// Stable key over the active filters. The root/expanded bootstrap effect
	// reads this so changing a filter while the tree is open re-fetches every
	// open folder under the new query (the stream key already includes filters,
	// so a change points every folder at a fresh, unloaded stream).
	const filterKey = $derived(JSON.stringify(pageFilterStreamFields(filters)));

	// Persist expanded-node state across remounts (navigating into a page
	// and back shouldn't collapse the tree the user just opened). Matches
	// the sessionStorage pattern used by PagesMillerView.
	const STORAGE_KEY_EXPANDED = 'grav_admin_pages_tree_expanded';
	function loadExpandedFromStorage(): Set<string> {
		if (typeof window === 'undefined') return new Set(['/']);
		try {
			const raw = sessionStorage.getItem(STORAGE_KEY_EXPANDED);
			if (raw) {
				const arr = JSON.parse(raw);
				if (Array.isArray(arr)) {
					const set = new Set<string>(arr);
					set.add('/'); // root is always expanded
					return set;
				}
			}
		} catch { /* fall through */ }
		return new Set(['/']);
	}
	function saveExpandedToStorage(routes: Set<string>) {
		if (typeof window === 'undefined') return;
		const arr = Array.from(routes).filter(r => r !== '/');
		if (arr.length > 0) {
			sessionStorage.setItem(STORAGE_KEY_EXPANDED, JSON.stringify(arr));
		} else {
			sessionStorage.removeItem(STORAGE_KEY_EXPANDED);
		}
	}

	let expandedRoutes = $state<Set<string>>(loadExpandedFromStorage());
	let rootLoading = $state(true);
	let searchActive = $derived(searchQuery.trim().length > 0);
	let sortField = $state<SortField>('default');
	let sortOrder = $state<'asc' | 'desc'>('asc');

	// Drag-and-drop state
	let dragPage = $state<PageSummary | null>(null);
	let dragParentRoute = $state<string | null>(null);
	let dropTarget = $state<{ parentRoute: string; index: number } | null>(null);
	let saving = $state(false);

	// ── Chunked per-folder loading ───────────────────────────────────────────

	const chunkSize = $derived(prefs.pagesChunkSize);

	/** `all`: the folder's every child, ignoring the filters (what a move numbers against). */
	function streamConfigFor(parentRoute: string, all = false): StreamConfig {
		return {
			children_of: parentRoute,
			sort: all ? 'default' : sortField,
			order: all ? 'asc' : sortOrder,
			lang: lang || undefined,
			translations: lang ? true : undefined,
			...(all ? {} : pageFilterStreamFields(filters)),
		};
	}

	function streamKeyFor(parentRoute: string, all = false): string {
		return streamKey(streamConfigFor(parentRoute, all), chunkSize);
	}

	// Open folders whose first chunk failed to load. They show a retry in
	// place of their rows instead of a spinner that never stops.
	let failedFolders = $state<Set<string>>(new Set());

	function markFolderFailed(parentRoute: string, failed: boolean) {
		if (failedFolders.has(parentRoute) === failed) return;
		const next = new Set(failedFolders);
		if (failed) next.add(parentRoute);
		else next.delete(parentRoute);
		failedFolders = next;
	}

	/** Load a folder's first chunk. False when the request failed. */
	async function bootstrapFolder(parentRoute: string): Promise<boolean> {
		markFolderFailed(parentRoute, false);
		try {
			await pagesChunks.ensureChunkForIndex(
				streamKeyFor(parentRoute),
				streamConfigFor(parentRoute),
				chunkSize,
				0,
			);
			return true;
		} catch {
			markFolderFailed(parentRoute, true);
			return false;
		}
	}

	function loadedPagesFor(parentRoute: string, all = false): PageSummary[] {
		const key = streamKeyFor(parentRoute, all);
		const total = pagesChunks.getTotal(key);
		if (total === null || total === 0) return [];
		const out: PageSummary[] = [];
		for (let i = 0; i < total; i++) {
			const r = pagesChunks.getRow(key, i);
			if (r) out.push(r);
		}
		return out;
	}

	function totalChildren(parentRoute: string): number | null {
		return pagesChunks.getTotal(streamKeyFor(parentRoute));
	}

	interface ChunkBlock {
		page: number;
		startIndex: number;
		count: number;
		loaded: boolean;
		rows: PageSummary[];
	}

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

	function toggleSort(field: SortField) {
		if (sortField === field) {
			sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
		} else {
			sortField = field;
			sortOrder = field === 'modified' || field === 'date' ? 'desc' : 'asc';
		}
		// New stream key; old streams stay cached.
		bootstrapFolder('/');
	}

	// The folder opens (and its chevron spins) before its first chunk is
	// requested, and closing it mid-request keeps it closed (admin2#200).
	function toggleExpand(route: string) {
		void toggleFolder(route, {
			expanded: () => expandedRoutes,
			setExpanded: (next) => {
				expandedRoutes = next;
				saveExpandedToStorage(next);
			},
			load: bootstrapFolder,
		});
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
		// Only `lang` should trigger a re-bootstrap. We read `expandedRoutes`
		// untracked so user expansions / focus-restore additions don't
		// re-fire this whole pass — those code paths bootstrap their own
		// folders directly.
		if (lang !== prevLang) {
			prevLang = lang;
		}
		// Track filter changes too, so toggling a filter re-bootstraps the tree.
		void filterKey;
		rootLoading = true;
		untrack(() => {
			const initialExpanded = Array.from(expandedRoutes).filter(r => r !== '/');
			(async () => {
				await bootstrapFolder('/');
				rootLoading = false;
				await Promise.all(initialExpanded.map(r => bootstrapFolder(r)));
				// Drop expanded entries whose folder never resolved (page
				// deleted in another tab) so storage doesn't accumulate
				// stale routes.
				const stale = initialExpanded.filter(r => totalChildren(r) === null);
				if (stale.length > 0) {
					const cleaned = new Set(expandedRoutes);
					for (const r of stale) cleaned.delete(r);
					expandedRoutes = cleaned;
					saveExpandedToStorage(cleaned);
				}
			})();
		});
	});

	// Server-side search across the whole site (debounced, and each keystroke
	// aborts the request before it). When the input is non-empty, render a
	// flat list of server matches instead of the tree.
	const search = createPageSearch({
		params: () => ({ lang: lang || undefined, translations: !!lang }),
	});
	$effect(() => {
		search.run(searchQuery);
	});
	$effect(() => () => search.dispose());

	// Silent refresh: the chunk store auto-invalidates on `pages:*`. All we
	// need to do is re-bootstrap the affected folders so the user doesn't see
	// empty placeholders briefly.
	function silentRefresh(parentRoutes: string[]) {
		for (const p of parentRoutes) bootstrapFolder(p);
	}

	onMount(() => {
		// One-shot scroll restore: if the user just came back from editing a
		// page, expand every ancestor on the way down, load the chunks
		// containing the target row, then scroll the row to the top of the
		// scrollable ancestor. Cleared so a subsequent fresh visit lands at
		// the top.
		const FOCUS_KEY = 'grav_admin_pages_focus';
		const focusRoute = sessionStorage.getItem(FOCUS_KEY);
		if (focusRoute) {
			sessionStorage.removeItem(FOCUS_KEY);
			(async () => {
				try {
					// Expand every ancestor folder so the row will be rendered.
					const segments = focusRoute.split('/').filter(Boolean);
					const ancestors: string[] = [];
					for (let i = 0; i < segments.length - 1; i++) {
						ancestors.push('/' + segments.slice(0, i + 1).join('/'));
					}
					const nextExpanded = new Set(expandedRoutes);
					for (const a of ancestors) nextExpanded.add(a);
					if (nextExpanded.size !== expandedRoutes.size) {
						expandedRoutes = nextExpanded;
						saveExpandedToStorage(nextExpanded);
					}
					// Bootstrap each ancestor's children, then use the locate
					// endpoint on the immediate parent so the chunk holding
					// the focus row is resident. After each await we poll the
					// chunk store directly because the lang $effect may also
					// be loading the same folders concurrently — both paths
					// dedupe through the chunk store.
					for (const a of ['/', ...ancestors]) await bootstrapFolder(a);
					const directParent = ancestors[ancestors.length - 1] ?? '/';
					await pagesChunks.ensureChunkForRoute(
						streamKeyFor(directParent),
						streamConfigFor(directParent),
						chunkSize,
						focusRoute,
					);
					// Render needs an extra frame after the chunk lands —
					// `tick()` flushes one round, but the chunk-store write
					// triggers `chunkBlocksFor` to re-derive, which in turn
					// needs another microtask to materialize the new rows.
					await tick();
					await new Promise(res => requestAnimationFrame(() => res(null)));
					scrollRouteIntoView(focusRoute);
				} catch { /* row may have been deleted */ }
			})();
		}

		// The chunk store drops every stream on any `pages:*` event, so every
		// folder on screen needs its first chunk back, not just the edited
		// page's parent. The bus calls this once per save (it used to run once
		// per tag, and the second pass dropped the requests the first had just
		// started). Collapsed folders reload when they are next expanded.
		const refreshVisible = () => silentRefresh(['/', ...Array.from(expandedRoutes).filter(r => r !== '/')]);
		const onPages = () => {
			refreshVisible();
			if (searchActive) search.refresh();
		};
		const onFocus = () => {
			refreshVisible();
			if (searchActive) search.refresh();
		};
		const unsubPages = invalidations.subscribe('pages:*', onPages);
		const unsubFocus = invalidations.subscribe('*:focus', onFocus);
		return () => { unsubPages(); unsubFocus(); };
	});

	// Reorder mode: every visible folder's full sibling list must be resident
	// so reorganize ops include every position. Force-load on toggle, and on
	// any expand while reorder is active.
	$effect(() => {
		if (!reorderMode) return;
		const folders = ['/', ...Array.from(expandedRoutes).filter(r => r !== '/')];
		const size = chunkSize;
		untrack(() => {
			for (const f of folders) {
				pagesChunks.ensureAllChunks(streamKeyFor(f), streamConfigFor(f), size);
			}
		});
	});

	function matchesSearch(page: PageSummary): boolean {
		if (!searchQuery) return true;
		const q = searchQuery.toLowerCase();
		return page.title.toLowerCase().includes(q) ||
			pageLabel(page).toLowerCase().includes(q) ||
			page.route.toLowerCase().includes(q) ||
			page.template.toLowerCase().includes(q);
	}

	/** Get the parent route of a page. Uses raw_route so the home page (whose
	 *  public route is `/`) resolves to its real parent (root) instead of
	 *  treating itself as its own parent. */
	function getParentRoute(page: PageSummary): string {
		return parentRouteOf(pageApiRoute(page));
	}

	/** "Publish"/"Unpublish" plus the state the page is in, for the toggle's tooltip. */
	function togglePublishedLabel(page: PageSummary): string {
		return pageStatusToggleLabel(
			page,
			i18n.t(page.published ? 'ADMIN_NEXT.PAGES.UNPUBLISH' : 'ADMIN_NEXT.PAGES.PUBLISH'),
		);
	}

	// --- Drag-and-drop handlers ---

	function handleDragStart(e: DragEvent, page: PageSummary) {
		// Search results are a flat list across folders: no position to drop into.
		if (!reorderMode || searchActive) return;
		dragPage = page;
		dragParentRoute = getParentRoute(page);
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', pageApiRoute(page));
		}
	}

	/** A page can't go inside itself or anywhere below it. */
	function canDropInto(parentRoute: string): boolean {
		return !!dragPage && !isWithin(parentRoute, pageApiRoute(dragPage));
	}

	function handleDragOver(e: DragEvent, parentRoute: string, index: number) {
		if (!reorderMode || !dragPage) return;
		if (!canDropInto(parentRoute)) {
			dropTarget = null;
			return;
		}
		e.preventDefault();
		e.stopPropagation();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		dropTarget = { parentRoute, index };
	}

	async function handleDrop(e: DragEvent, targetParentRoute: string, targetIndex: number) {
		e.preventDefault();
		e.stopPropagation();
		if (!dragPage || saving || !canDropInto(targetParentRoute)) {
			resetDragState();
			return;
		}

		const page = dragPage;
		const pageRoute = pageApiRoute(page);
		const sourceParentRoute = dragParentRoute!;
		resetDragState();

		// Number against the folder's full child list, not just the rows a
		// filter left on screen, so a move never reuses a hidden page's number.
		await Promise.all([
			pagesChunks.ensureAllChunks(streamKeyFor(targetParentRoute), streamConfigFor(targetParentRoute), chunkSize),
			pagesChunks.ensureAllChunks(streamKeyFor(targetParentRoute, true), streamConfigFor(targetParentRoute, true), chunkSize),
		]);
		const shown = loadedPagesFor(targetParentRoute).map(pageApiRoute);
		const siblings = loadedPagesFor(targetParentRoute, true).map((p) => ({ route: pageApiRoute(p), order: p.order }));
		const insertAt = fullInsertIndex(shown, siblings.map((p) => p.route), targetIndex);

		const ops = buildMoveOps({
			page: { route: pageRoute, order: page.order },
			fromParent: sourceParentRoute,
			toParent: targetParentRoute,
			siblings,
			insertAt,
		});
		if (ops.length === 0) {
			// Dropped somewhere else in its own folder, but a page without a
			// number sorts by name, so there is nothing to change.
			const from = siblings.findIndex((p) => p.route === pageRoute);
			if (orderNumber(page.order) === null && from !== -1 && landingIndex(siblings, pageRoute, insertAt) !== from) {
				toast.info(i18n.t('ADMIN_NEXT.PAGES.MOVE_UNNUMBERED_KEEPS_NAME_ORDER', { title: page.title }));
			}
			return;
		}

		saving = true;

		try {
			await reorganizePages(ops);
			toast.success(i18n.t('ADMIN_NEXT.TOASTS.ITEM_MOVED', { name: page.title }));
			followMove(pageRoute, targetParentRoute);
			// pages:* invalidation drops the chunk store; the bootstrap
			// effect re-fires for affected folders.
		} catch (err: unknown) {
			const message = err && typeof err === 'object' && 'message' in err
				? String((err as { message: string }).message)
				: '';
			toast.error(message || i18n.t('ADMIN_NEXT.PAGES.PAGES_TREE_VIEW.FAILED_TO_REORGANIZE_PAGES'));
		} finally {
			saving = false;
		}
	}

	/**
	 * Keep the tree open where the page went: open folders inside the moved
	 * page follow it to its new route, and the folder it landed in opens.
	 */
	function followMove(oldRoute: string, newParent: string) {
		if (newParent === parentRouteOf(oldRoute)) return;
		const newRoute = (newParent === '/' ? '' : newParent) + '/' + oldRoute.slice(oldRoute.lastIndexOf('/') + 1);
		const next = new Set([
			...Array.from(expandedRoutes, (r) => (isWithin(r, oldRoute) ? newRoute + r.slice(oldRoute.length) : r)),
			newParent,
		]);
		expandedRoutes = next;
		saveExpandedToStorage(next);
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

	/**
	 * Per-placeholder IntersectionObserver. The scroll container varies by
	 * embed (admin shell vs full-page) so we let the observer use the
	 * implicit nearest scrollable ancestor via root: null and a generous
	 * rootMargin. Fires the chunk's own load plus its immediate neighbours
	 * for symmetric "preload as you approach" behaviour.
	 */
	function observeChunkPlaceholder(
		node: HTMLElement,
		params: { startIndex: number; parentRoute: string },
	) {
		let current = params;
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
			{ rootMargin: '1500px 0px' },
		);
		observer.observe(node);
		return {
			update(next: { startIndex: number; parentRoute: string }) {
				current = next;
			},
			destroy() { observer.disconnect(); },
		};
	}

	const ROW_HEIGHT_PX = 52;

	function scrollRouteIntoView(route: string): void {
		const row = document.querySelector<HTMLElement>(`[data-page-route="${CSS.escape(route)}"]`);
		if (!row) return;
		const scroller = findScrollableAncestor(row);
		if (!scroller) {
			row.scrollIntoView({ block: 'start' });
			return;
		}
		const scrollerRect = scroller.getBoundingClientRect();
		const rowRect = row.getBoundingClientRect();
		// Anything `position: sticky` pinned to the top of the scroller
		// (e.g. the page's StickyHeader with the toolbar) overlaps the top
		// of the visible area. Subtract its height from where we put the
		// row, otherwise the row ends up underneath the header.
		const stickyOffset = computeStickyTopOffset(scroller);
		scroller.scrollTop += rowRect.top - scrollerRect.top - stickyOffset - 8;
	}

	function findScrollableAncestor(el: HTMLElement): HTMLElement | null {
		let cur: HTMLElement | null = el.parentElement;
		while (cur) {
			const style = getComputedStyle(cur);
			if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && cur.scrollHeight > cur.clientHeight) {
				return cur;
			}
			cur = cur.parentElement;
		}
		return null;
	}

	/** Total pixel height occupied by any `position: sticky` element pinned
	 *  to the scroller's top edge. Used to keep restored rows below toolbars. */
	function computeStickyTopOffset(scroller: HTMLElement): number {
		const sticky = scroller.querySelectorAll<HTMLElement>('.sticky');
		if (sticky.length === 0) return 0;
		const scrollerTop = scroller.getBoundingClientRect().top;
		let maxBottom = scrollerTop;
		for (const el of sticky) {
			if (getComputedStyle(el).position !== 'sticky') continue;
			const r = el.getBoundingClientRect();
			// Only count headers that are currently pinned at the scroller's
			// top — i.e. their visible top edge is at (or within ~2px of)
			// the scroller's top edge.
			if (Math.abs(r.top - scrollerTop) > 2) continue;
			if (r.bottom > maxBottom) maxBottom = r.bottom;
		}
		return maxBottom - scrollerTop;
	}
</script>

{#snippet sortHeader(label: string, field: SortField, align: string = 'left')}
	<button
		class="flex items-center gap-1 text-[0.6875rem] font-medium tracking-wider transition-colors
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
<div class="flex items-center gap-2 border-b border-border px-2 py-2 sm:px-4">
	{#if reorderMode}<div class="w-6"></div>{/if}
	<div class="min-w-0 flex-1">{@render sortHeader(i18n.t('ADMIN_NEXT.PAGES.HEADER_TITLE'), 'title')}</div>
	{#if !reorderMode}
		<div class="hidden w-36 text-center md:block lg:w-44">
			<span class="text-[0.6875rem] font-medium tracking-wider text-muted-foreground">{i18n.t('ADMIN_NEXT.PAGES.HEADER_TEMPLATE')}</span>
		</div>
		<div class="w-6 text-center" title={i18n.t('ADMIN_NEXT.PAGES.HEADER_STATUS')}>
			<span class="text-[0.6875rem] font-medium tracking-wider text-muted-foreground">·</span>
		</div>
		<div class="hidden w-20 text-end sm:block">{@render sortHeader(i18n.t('ADMIN_NEXT.PAGES.HEADER_MODIFIED'), 'modified', 'right')}</div>
		{#if onCopy || onDelete}
			<div class="w-14"></div>
		{/if}
	{/if}
</div>

{#if rootLoading}
	<div class="py-12 text-center text-sm text-muted-foreground">
		<Loader2 size={16} class="mx-auto mb-2 animate-spin" />
		{i18n.t('ADMIN_NEXT.PAGES.LOADING')}
	</div>
{:else}
	{#snippet chunkPlaceholder(parentRoute: string, startIndex: number, count: number, depth: number)}
		<div
			class="flex items-center border-b border-border/40 text-[0.75rem] text-muted-foreground/60"
			style="min-height: {count * ROW_HEIGHT_PX}px; padding-inline-start: {16 + depth * 20}px;"
			use:observeChunkPlaceholder={{ startIndex, parentRoute }}
		>
			<Loader2 size={12} class="me-1.5 animate-spin" />
			{i18n.t('ADMIN_NEXT.PAGES.LOADING_CHUNK', { from: startIndex + 1, to: startIndex + count })}
		</div>
	{/snippet}

	<!-- An open folder whose first chunk hasn't arrived: loading, or a retry
	     when the request failed. -->
	{#snippet folderPending(parentRoute: string, depth: number)}
		<div
			class="flex items-center gap-2 border-b border-border/40 py-2 pe-4 text-[0.75rem] text-muted-foreground"
			style="padding-inline-start: {16 + depth * 20}px"
		>
			{#if failedFolders.has(parentRoute)}
				<span class="text-destructive">{i18n.t('ADMIN_NEXT.PAGES.LOAD_CHILDREN_FAILED')}</span>
				<button
					type="button"
					class="font-medium text-primary hover:underline"
					onclick={() => bootstrapFolder(parentRoute)}
				>
					{i18n.t('ADMIN_NEXT.RETRY')}
				</button>
			{:else}
				<Loader2 size={12} class="animate-spin" />
				{i18n.t('ADMIN_NEXT.LOADING')}
			{/if}
		</div>
	{/snippet}

	<!-- Move mode: a thin strip at the start and end of every open folder's
	     child list (and the top level). Hovering one draws the same line a row
	     draws above itself, so a page can land first or last in any folder. -->
	{#snippet dropLine(parentRoute: string, index: number, depth: number)}
		<div
			class="relative h-2"
			aria-hidden="true"
			ondragover={(e) => handleDragOver(e, parentRoute, index)}
			ondrop={(e) => handleDrop(e, parentRoute, index)}
		>
			{#if isDropTarget(parentRoute, index)}
				<div class="absolute inset-x-0 top-1/2 me-4 h-0.5 -translate-y-1/2 rounded bg-primary" style="margin-inline-start: {16 + depth * 20}px"></div>
			{/if}
		</div>
	{/snippet}

	<!-- Move mode: an open page with no children takes a drop as its first child. -->
	{#snippet dropInside(page: PageSummary, apiRoute: string, depth: number)}
		{@const active = isDropTarget(apiRoute, 0)}
		{@const blocked = !!dragPage && !canDropInto(apiRoute)}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="border-b border-border/50 py-1.5 pe-4"
			style="padding-inline-start: {16 + depth * 20}px"
			ondragover={(e) => handleDragOver(e, apiRoute, 0)}
			ondrop={(e) => handleDrop(e, apiRoute, 0)}
		>
			<div class="flex h-8 items-center rounded-md border border-dashed px-3 text-[0.75rem] transition-colors
				{active ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground'}
				{blocked ? 'opacity-50' : ''}">
				<span class="truncate">{i18n.t('ADMIN_NEXT.PAGES.DROP_INSIDE', { title: page.title })}</span>
			</div>
		</div>
	{/snippet}

	<!-- svelte-ignore a11y_no_static_element_interactions -->
	{#snippet treeRow(page: PageSummary, depth: number, parentRoute: string, index: number)}
		{#if matchesSearch(page)}
			<!-- Use raw_route for identity keys so the home page (public route '/')
				 doesn't collide with the root-parent marker '/', which would cause
				 the snippet to recurse into itself. -->
			{@const apiRoute = pageApiRoute(page)}
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
			<!-- The line above the first row belongs to the folder's start strip. -->
			{#if reorderMode && index > 0 && isDropTarget(parentRoute, index) && !isDragging(page)}
				<div class="me-4 h-0.5 rounded bg-primary transition-all" style="margin-inline-start: {16 + depth * 20}px"></div>
			{/if}
			<div
				data-page-route={apiRoute}
				class="group flex items-center gap-2 border-b border-border/50 px-2 py-2 transition-colors sm:px-4
					{isDragging(page) ? 'opacity-30' : 'hover:bg-accent/50'}
					{saving ? 'pointer-events-none' : ''}"
				draggable={reorderMode && !searchActive}
				ondragstart={(e) => handleDragStart(e, page)}
				ondragover={(e) => handleDragOver(e, parentRoute, index)}
				ondrop={(e) => handleDrop(e, parentRoute, index)}
				ondragend={handleDragEnd}
			>
				<div class="flex min-w-0 flex-1 items-center gap-1" style="padding-inline-start: {depth * 20}px">
					{#if reorderMode}
						<span class="flex shrink-0 cursor-grab items-center text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing">
							<GripVertical size={14} />
						</span>
					{/if}

					{#if page.has_children}
						<button
							class="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
							onclick={() => toggleExpand(apiRoute)}
							aria-expanded={expandedRoutes.has(apiRoute)}
						>
							{#if expandedRoutes.has(apiRoute) && totalChildren(apiRoute) === null && !failedFolders.has(apiRoute)}
								<Loader2 size={13} class="animate-spin" />
							{:else if expandedRoutes.has(apiRoute)}
								<ChevronDown size={14} />
							{:else}
								<DirectionalIcon name="chevron-forward" size={14} />
							{/if}
						</button>
					{:else if reorderMode && !searchActive}
						<!-- Move mode: any page can be opened to drop a first child into it. -->
						<button
							type="button"
							class="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:text-foreground"
							onclick={() => toggleExpand(apiRoute)}
							title={i18n.t('ADMIN_NEXT.PAGES.SHOW_DROP_INSIDE', { title: page.title })}
							aria-label={i18n.t('ADMIN_NEXT.PAGES.SHOW_DROP_INSIDE', { title: page.title })}
							aria-expanded={expandedRoutes.has(apiRoute)}
						>
							{#if expandedRoutes.has(apiRoute)}
								<ChevronDown size={14} />
							{:else}
								<DirectionalIcon name="chevron-forward" size={14} />
							{/if}
						</button>
					{:else}
						<span class="w-5"></span>
					{/if}

					{#if page.has_children}
						{#if expandedRoutes.has(apiRoute)}
							<FolderOpen size={14} class="shrink-0 {page.visible ? 'text-primary' : 'text-muted-foreground'}" />
						{:else}
							<Folder size={14} class="shrink-0 {page.visible ? 'text-primary/70' : 'text-muted-foreground'}" />
						{/if}
					{:else}
						<File size={14} class="shrink-0 {page.visible ? 'text-primary/70' : 'text-muted-foreground'}" />
					{/if}

					<a
						class="min-w-0 flex-1 text-start ps-1"
						href={pageEditUrl(pageApiRoute(page))}
						onclick={linkClick(() => onEdit(pageApiRoute(page)))}
						draggable={!reorderMode}
					>
						<div class="flex min-w-0 items-center gap-1.5">
							<span class="min-w-0 truncate text-sm font-medium group-hover:text-primary
								{isUntranslated ? 'text-muted-foreground italic' : 'text-foreground'}"
								title={pageTitleIfDifferent(page) ? i18n.t('ADMIN_NEXT.PAGES.PAGE_TITLE_HINT', { title: page.title }) : undefined}>{pageLabel(page)}</span>
							{#if lang && badgeKeys.length > 0}
								<div class="shrink-0">
									<TranslationBadges
										translated={badgeKeys}
										currentLang={explicitFiles.includes(lang) ? lang : undefined}
									/>
								</div>
							{/if}
						</div>
						<div class="truncate text-[0.6875rem] text-muted-foreground">{page.route}</div>
					</a>
				</div>

				{#if !reorderMode}
					<div class="hidden w-36 text-center md:block lg:w-44" title={page.template}>
						<Badge variant="outline" class="max-w-full"><span class="block truncate">{page.template}</span></Badge>
					</div>

					<div class="flex w-6 justify-center">
						{#if onTogglePublished && pageCan(page, 'publish') && !isUntranslated}
							<button
								type="button"
								class="inline-flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-accent"
								onclick={(e) => { e.stopPropagation(); onTogglePublished(page); }}
								title={togglePublishedLabel(page)}
								aria-label={togglePublishedLabel(page)}
							>
								<PageStatusIndicator {page} decorative />
							</button>
						{:else}
							<PageStatusIndicator {page} />
						{/if}
					</div>

					<div class="hidden w-20 text-end text-[0.6875rem] text-muted-foreground sm:block">
						{formatDate(page.modified)}
					</div>

					{#if (onCopy && pageCan(page, 'update')) || (onDelete && pageCan(page, 'delete'))}
						{@const copying = copyingRoutes?.has(page.route) ?? false}
						<div class="flex w-14 shrink-0 items-center justify-end gap-1">
							{#if onCopy && pageCan(page, 'update')}
								<button
									class="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
									onclick={(e) => { e.stopPropagation(); onCopy(page); }}
									disabled={copying}
									title={i18n.t('ADMIN_NEXT.PAGES.EDIT.COPY_PAGE')}
								>
									{#if copying}
										<Loader2 size={12} class="animate-spin" />
									{:else}
										<Copy size={12} />
									{/if}
								</button>
							{/if}
							{#if onDelete && pageCan(page, 'delete') && !isUntranslated}
								<button
									class="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
									onclick={(e) => { e.stopPropagation(); onDelete(page); }}
									title={i18n.t('ADMIN_NEXT.DELETE')}
								>
									<Trash2 size={12} />
								</button>
							{/if}
						</div>
					{/if}
				{/if}
			</div>

			{#if !searchActive && (page.has_children || reorderMode) && expandedRoutes.has(apiRoute)}
				{@const totalAtRoute = totalChildren(apiRoute)}
				{#if totalAtRoute === null}
					{@render folderPending(apiRoute, depth + 1)}
				{:else if reorderMode && totalAtRoute === 0}
					{@render dropInside(page, apiRoute, depth + 1)}
				{:else}
					{#if reorderMode && totalAtRoute}{@render dropLine(apiRoute, 0, depth + 1)}{/if}
					{#each chunkBlocksFor(apiRoute) as block (block.page)}
						{#if block.loaded}
							{#each block.rows as child, childOffset (pageApiRoute(child))}
								{@render treeRow(child, depth + 1, apiRoute, block.startIndex + childOffset)}
							{/each}
						{:else}
							{@render chunkPlaceholder(apiRoute, block.startIndex, block.count, depth + 1)}
						{/if}
					{/each}
					{#if reorderMode && totalAtRoute}{@render dropLine(apiRoute, totalAtRoute, depth + 1)}{/if}
				{/if}
			{/if}
		{/if}
	{/snippet}

	{#if searchActive}
		{#if search.loading}
			<div class="py-12 text-center text-sm text-muted-foreground">
				<Loader2 size={16} class="mx-auto mb-2 animate-spin" />
				{i18n.t('ADMIN_NEXT.PAGES.PAGES_TREE_VIEW.SEARCHING')}
			</div>
		{:else if search.results.length === 0}
			<div class="py-12 text-center text-sm text-muted-foreground">
				{i18n.t('ADMIN_NEXT.PAGES.PAGES_TREE_VIEW.NO_PAGES_MATCH', { query: searchQuery })}
			</div>
		{:else}
			{#each search.results as page (pageApiRoute(page))}
				{@render treeRow(page, 0, '/', -1)}
			{/each}
			<div class="flex items-center gap-3 px-4 py-2 text-[0.6875rem] text-muted-foreground">
				<span>
					{search.hasMore
						? i18n.t('ADMIN_NEXT.PAGES.SEARCH_SHOWING', { shown: search.results.length, total: search.total })
						: i18n.t('ADMIN_NEXT.PAGES.SEARCH_MATCH_COUNT', { n: search.results.length })}
				</span>
				{#if search.hasMore}
					<button
						type="button"
						class="font-medium text-primary hover:underline disabled:opacity-50"
						disabled={search.loadingMore}
						onclick={() => search.more()}
					>
						{i18n.t('ADMIN_NEXT.PAGES.SEARCH_SHOW_MORE')}
					</button>
				{/if}
			</div>
		{/if}
	{:else}
		{@const rootBlocks = chunkBlocksFor('/')}
		{@const rootTotal = totalChildren('/')}
		{#if reorderMode && rootTotal}{@render dropLine('/', 0, 0)}{/if}
		{#each rootBlocks as block (block.page)}
			{#if block.loaded}
				<!-- Key on the structural route (raw_route), which is unique by construction.
				     Two siblings can share a public route when one declares an explicit `slug:`
				     in its frontmatter, and a duplicate key aborts the whole listing (admin2#154). -->
				{#each block.rows as page, offset (pageApiRoute(page))}
					{@render treeRow(page, 0, '/', block.startIndex + offset)}
				{/each}
			{:else}
				{@render chunkPlaceholder('/', block.startIndex, block.count, 0)}
			{/if}
		{/each}

		{#if reorderMode && rootTotal}{@render dropLine('/', rootTotal, 0)}{/if}

		{#if rootTotal === 0}
			<div class="py-12 text-center text-sm text-muted-foreground">{i18n.t('ADMIN_NEXT.PAGES.NO_PAGES')}</div>
		{/if}
	{/if}
{/if}
