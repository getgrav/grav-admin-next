<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { reorganizePages, searchPages, pageApiRoute, parentRouteOf } from '$lib/api/endpoints/pages';
	import type { PageSummary, PageDetail, ReorganizeOperation } from '$lib/api/endpoints/pages';
	import { invalidations } from '$lib/stores/invalidation.svelte';
	import { onMount, tick, untrack } from 'svelte';
	import { Badge } from '$lib/components/ui/badge';
	import TranslationBadges from '$lib/components/ui/TranslationBadges.svelte';
	import { contentLang } from '$lib/stores/contentLang.svelte';
	import { toast } from 'svelte-sonner';
	import {
		ChevronDown, FolderOpen, Folder, File, Loader2, Trash2, Copy,
		ArrowUp, ArrowDown, GripVertical, CircleCheck, CircleDashed
	} from 'lucide-svelte';
	import DirectionalIcon from '$lib/components/ui/DirectionalIcon.svelte';
	import { prefs } from '$lib/stores/preferences.svelte';
	import { pagesChunks, streamKey, type StreamConfig } from '$lib/stores/pagesChunks.svelte';
	import { emptyPageFilters, pageFilterStreamFields, type PageFilters } from '$lib/utils/pageFilters';

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
	let searchResults = $state<PageSummary[]>([]);
	let searchLoading = $state(false);
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

	async function bootstrapFolder(parentRoute: string): Promise<void> {
		try {
			await pagesChunks.ensureChunkForIndex(
				streamKeyFor(parentRoute),
				streamConfigFor(parentRoute),
				chunkSize,
				0,
			);
		} catch { /* surfaced upstream */ }
	}

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

	async function toggleExpand(route: string) {
		const next = new Set(expandedRoutes);
		if (next.has(route)) {
			next.delete(route);
		} else {
			next.add(route);
			await bootstrapFolder(route);
		}
		expandedRoutes = next;
		saveExpandedToStorage(next);
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

	// Server-side search across the whole site (debounced). When the input is
	// non-empty, render a flat list of server matches instead of the tree.
	let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		const q = searchQuery.trim();
		if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
		if (!q) {
			searchResults = [];
			searchLoading = false;
			return;
		}
		searchLoading = true;
		searchDebounceTimer = setTimeout(async () => {
			try {
				searchResults = await searchPages(q, {
					lang: lang || undefined,
					translations: !!lang,
				});
			} catch {
				searchResults = [];
			} finally {
				searchLoading = false;
			}
		}, 250);
	});

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

		const onPages = (e: { id?: string }) => {
			if (!e.id) {
				silentRefresh(['/', ...Array.from(expandedRoutes).filter(r => r !== '/')]);
				return;
			}
			const parent = parentRouteOf(e.id);
			const targets: string[] = [];
			// Re-bootstrap the affected parent and root.
			targets.push(parent);
			if (parent !== '/') targets.push('/');
			silentRefresh(targets);
		};
		const onFocus = () => silentRefresh(['/', ...Array.from(expandedRoutes).filter(r => r !== '/')]);
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
			page.route.toLowerCase().includes(q) ||
			page.template.toLowerCase().includes(q);
	}

	/** Get the parent route of a page. Uses raw_route so the home page (whose
	 *  public route is `/`) resolves to its real parent (root) instead of
	 *  treating itself as its own parent. */
	function getParentRoute(page: PageSummary): string {
		return parentRouteOf(pageApiRoute(page));
	}

	/** True if any sibling under this parent has a numeric order prefix.
	 *  Used to decide whether the destination "expects" ordered children. */
	function parentHasOrdering(parentRoute: string): boolean {
		const siblings = loadedPagesFor(parentRoute);
		return siblings.some(s => s.order !== null && s.order !== '');
	}

	/** True if this page itself currently carries a numeric order prefix. */
	function pageIsOrdered(page: PageSummary): boolean {
		return page.order !== null && page.order !== '';
	}

	// --- Drag-and-drop handlers ---

	function handleDragStart(e: DragEvent, page: PageSummary) {
		if (!reorderMode) return;
		dragPage = page;
		dragParentRoute = getParentRoute(page);
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', pageApiRoute(page));
		}
	}

	function handleDragOver(e: DragEvent, parentRoute: string, index: number) {
		if (!reorderMode || !dragPage) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		dropTarget = { parentRoute, index };
	}

	async function handleDrop(e: DragEvent, targetParentRoute: string, targetIndex: number) {
		e.preventDefault();
		if (!dragPage || saving) return;

		const page = dragPage;
		const pageRoute = pageApiRoute(page);
		const sourceParentRoute = dragParentRoute!;

		// Reorganize must reflect the FULL sibling list of any folder it
		// touches. Make sure both source and target are fully resident.
		await Promise.all([
			pagesChunks.ensureAllChunks(streamKeyFor(sourceParentRoute), streamConfigFor(sourceParentRoute), chunkSize),
			pagesChunks.ensureAllChunks(streamKeyFor(targetParentRoute), streamConfigFor(targetParentRoute), chunkSize),
		]);

		const siblings = loadedPagesFor(targetParentRoute);
		const targetIsOrdered = parentHasOrdering(targetParentRoute);
		const sourceIsOrdered = parentHasOrdering(sourceParentRoute);

		// Build the reorder operations. We only emit position values for
		// pages that already participate in ordering — assigning positions
		// to unordered pages would force-rename them with NN. prefixes.
		const ops: ReorganizeOperation[] = [];

		if (sourceParentRoute === targetParentRoute) {
			// Same-parent reorder
			const currentIndex = siblings.findIndex(s => pageApiRoute(s) === pageRoute);
			if (currentIndex === -1 || currentIndex === targetIndex) {
				resetDragState();
				return;
			}

			const reordered = [...siblings];
			const [moved] = reordered.splice(currentIndex, 1);
			reordered.splice(targetIndex, 0, moved);

			reordered.forEach((p, i) => {
				if (pageIsOrdered(p) || pageApiRoute(p) === pageRoute) {
					ops.push({ route: pageApiRoute(p), position: i + 1 });
				}
			});
		} else {
			// Cross-parent move. The moved page gets a position only if the
			// destination parent already uses ordering (or the page itself
			// was ordered and we want to keep it ordered).
			const movedOp: ReorganizeOperation = {
				route: pageRoute,
				parent: targetParentRoute,
			};
			if (targetIsOrdered || pageIsOrdered(page)) {
				movedOp.position = targetIndex + 1;
			}
			ops.push(movedOp);

			// Renumber source-parent siblings only if the source uses
			// ordering — otherwise leave unordered pages alone. We must NOT
			// renumber any sibling that is an ancestor of the destination
			// parent: doing so renames its folder mid-batch, which
			// invalidates every later op that targets a path under it
			// (Phase 3 rename then fails with "No such file or directory").
			if (sourceIsOrdered) {
				const sourceSiblings = loadedPagesFor(sourceParentRoute)
					.filter(s => {
						const r = pageApiRoute(s);
						if (r === pageRoute) return false;
						if (r === targetParentRoute) return false;
						if (targetParentRoute.startsWith(r + '/')) return false;
						return true;
					});
				sourceSiblings.forEach((p, i) => {
					if (pageIsOrdered(p)) {
						ops.push({ route: pageApiRoute(p), position: i + 1 });
					}
				});
			}

			// Renumber target-parent siblings only if the destination uses
			// ordering. Skip the moved page (already in ops above).
			if (targetIsOrdered) {
				const targetSiblings = [...siblings];
				targetSiblings.splice(targetIndex, 0, page);
				targetSiblings.forEach((p, i) => {
					if (pageApiRoute(p) === pageRoute) return;
					if (pageIsOrdered(p)) {
						ops.push({ route: pageApiRoute(p), position: i + 1 });
					}
				});
			}
		}

		resetDragState();
		saving = true;

		try {
			await reorganizePages(ops);
			toast.success(i18n.t('ADMIN_NEXT.TOASTS.ITEM_MOVED', { name: page.title }));
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
		class="flex items-center gap-1 text-[0.6875rem] font-medium uppercase tracking-wider transition-colors
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
	<div class="min-w-0 flex-1">{@render sortHeader('Title', 'title')}</div>
	{#if !reorderMode}
		<div class="hidden w-20 text-center md:block">
			<span class="text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">{i18n.t('ADMIN_NEXT.PAGES.HEADER_TEMPLATE')}</span>
		</div>
		<div class="w-6 text-center" title={i18n.t('ADMIN_NEXT.PAGES.HEADER_STATUS')}>
			<span class="text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">·</span>
		</div>
		<div class="hidden w-20 text-end sm:block">{@render sortHeader('Modified', 'modified', 'right')}</div>
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
			style="min-height: {count * ROW_HEIGHT_PX}px; padding-left: {16 + depth * 20}px;"
			use:observeChunkPlaceholder={{ startIndex, parentRoute }}
		>
			<Loader2 size={12} class="me-1.5 animate-spin" />
			{i18n.t('ADMIN_NEXT.PAGES.LOADING_CHUNK', { from: startIndex + 1, to: startIndex + count })}
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
			{#if reorderMode && isDropTarget(parentRoute, index) && !isDragging(page)}
				<div class="mx-4 h-0.5 rounded bg-primary transition-all" style="margin-left: {16 + depth * 20}px"></div>
			{/if}
			<div
				data-page-route={apiRoute}
				class="group flex items-center gap-2 border-b border-border/50 px-2 py-2 transition-colors sm:px-4
					{isDragging(page) ? 'opacity-30' : 'hover:bg-accent/50'}
					{saving ? 'pointer-events-none' : ''}"
				draggable={reorderMode}
				ondragstart={(e) => handleDragStart(e, page)}
				ondragover={(e) => handleDragOver(e, parentRoute, index)}
				ondrop={(e) => handleDrop(e, parentRoute, index)}
				ondragend={handleDragEnd}
			>
				<div class="flex min-w-0 flex-1 items-center gap-1" style="padding-left: {depth * 20}px">
					{#if reorderMode}
						<span class="flex shrink-0 cursor-grab items-center text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing">
							<GripVertical size={14} />
						</span>
					{/if}

					{#if page.has_children}
						<button
							class="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
							onclick={() => toggleExpand(apiRoute)}
						>
							{#if expandedRoutes.has(apiRoute) && totalChildren(apiRoute) === null}
								<Loader2 size={13} class="animate-spin" />
							{:else if expandedRoutes.has(apiRoute)}
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

					<button class="min-w-0 flex-1 text-start ps-1" onclick={() => onEdit(pageApiRoute(page))}>
						<div class="flex min-w-0 items-center gap-1.5">
							<span class="min-w-0 truncate text-sm font-medium group-hover:text-primary
								{isUntranslated ? 'text-muted-foreground italic' : 'text-foreground'}">{page.title}</span>
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
					</button>
				</div>

				{#if !reorderMode}
					<div class="hidden w-20 text-center md:block">
						<Badge variant="outline">{page.template}</Badge>
					</div>

					<div class="flex w-6 justify-center">
						{#if onTogglePublished}
							<button
								type="button"
								class="inline-flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-accent"
								onclick={(e) => { e.stopPropagation(); onTogglePublished(page); }}
								title={page.published ? i18n.t('ADMIN_NEXT.PAGES.UNPUBLISH') : i18n.t('ADMIN_NEXT.PAGES.PUBLISH')}
								aria-label={page.published ? i18n.t('ADMIN_NEXT.PAGES.UNPUBLISH') : i18n.t('ADMIN_NEXT.PAGES.PUBLISH')}
							>
								{#if page.published}
									<CircleCheck size={14} class="text-green-500" />
								{:else}
									<CircleDashed size={14} class="text-muted-foreground" />
								{/if}
							</button>
						{:else}
							<span title={page.published ? 'Published' : 'Draft'}>
								{#if page.published}
									<CircleCheck size={14} class="text-green-500" aria-label={i18n.t('ADMIN_NEXT.PAGES.PUBLISHED')} />
								{:else}
									<CircleDashed size={14} class="text-muted-foreground" aria-label="Draft" />
								{/if}
							</span>
						{/if}
					</div>

					<div class="hidden w-20 text-end text-[0.6875rem] text-muted-foreground sm:block">
						{formatDate(page.modified)}
					</div>

					{#if onCopy || onDelete}
						{@const copying = copyingRoutes?.has(page.route) ?? false}
						<div class="flex w-14 shrink-0 items-center justify-end gap-1">
							{#if onCopy}
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
							{#if onDelete}
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

			{#if !searchActive && page.has_children && expandedRoutes.has(apiRoute)}
				{#each chunkBlocksFor(apiRoute) as block (block.page)}
					{#if block.loaded}
						{#each block.rows as child, childOffset (child.route)}
							{@render treeRow(child, depth + 1, apiRoute, block.startIndex + childOffset)}
						{/each}
					{:else}
						{@render chunkPlaceholder(apiRoute, block.startIndex, block.count, depth + 1)}
					{/if}
				{/each}
				{@const totalAtRoute = totalChildren(apiRoute)}
				{#if reorderMode && totalAtRoute !== null && isDropTarget(apiRoute, totalAtRoute)}
					<div class="mx-4 h-0.5 rounded bg-primary transition-all" style="margin-left: {16 + (depth + 1) * 20}px"></div>
				{/if}
			{/if}
		{/if}
	{/snippet}

	{#if searchActive}
		{#if searchLoading}
			<div class="py-12 text-center text-sm text-muted-foreground">
				<Loader2 size={16} class="mx-auto mb-2 animate-spin" />
				{i18n.t('ADMIN_NEXT.PAGES.PAGES_TREE_VIEW.SEARCHING')}
			</div>
		{:else if searchResults.length === 0}
			<div class="py-12 text-center text-sm text-muted-foreground">
				{i18n.t('ADMIN_NEXT.PAGES.PAGES_TREE_VIEW.NO_PAGES_MATCH', { query: searchQuery })}
			</div>
		{:else}
			{#each searchResults as page (page.route)}
				{@render treeRow(page, 0, '/', -1)}
			{/each}
			<div class="px-4 py-2 text-[0.6875rem] text-muted-foreground">
				{searchResults.length} match{searchResults.length !== 1 ? 'es' : ''} across all pages
			</div>
		{/if}
	{:else}
		{@const rootBlocks = chunkBlocksFor('/')}
		{@const rootTotal = totalChildren('/')}
		{#each rootBlocks as block (block.page)}
			{#if block.loaded}
				{#each block.rows as page, offset (page.route)}
					{@render treeRow(page, 0, '/', block.startIndex + offset)}
				{/each}
			{:else}
				{@render chunkPlaceholder('/', block.startIndex, block.count, 0)}
			{/if}
		{/each}

		{#if reorderMode && rootTotal !== null && rootTotal > 0 && isDropTarget('/', rootTotal)}
			<div class="mx-4 h-0.5 rounded bg-primary"></div>
		{/if}

		{#if rootTotal === 0}
			<div class="py-12 text-center text-sm text-muted-foreground">{i18n.t('ADMIN_NEXT.PAGES.NO_PAGES')}</div>
		{/if}
	{/if}
{/if}
