<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { base } from '$app/paths';
	import { linkClick } from '$lib/utils/navLink';
	import { pageCan } from '$lib/utils/permissions';
	import { reorganizePages, pageApiRoute } from '$lib/api/endpoints/pages';
	import { createPageSearch } from '$lib/utils/page-search.svelte';
	import { invalidations } from '$lib/stores/invalidation.svelte';
	import type { PageSummary, PageDetail, PageListParams, ReorganizeOperation } from '$lib/api/endpoints/pages';
	import { onMount, tick, untrack } from 'svelte';
	import { Badge } from '$lib/components/ui/badge';
	import TranslationBadges from '$lib/components/ui/TranslationBadges.svelte';
	import PageStatusIndicator from '$lib/components/pages/PageStatusIndicator.svelte';
	import { pageStatusToggleLabel } from '$lib/utils/pageStatus';
	import { contentLang } from '$lib/stores/contentLang.svelte';
	import { toast } from 'svelte-sonner';
	import {
		ArrowUp, ArrowDown, File, Loader2, Trash2, Copy,
		GripVertical
	} from 'lucide-svelte';
	import { prefs } from '$lib/stores/preferences.svelte';
	import { pagesChunks, streamKey, type StreamConfig } from '$lib/stores/pagesChunks.svelte';
	import { emptyPageFilters, matchesPageFilters, pageFilterStreamFields, type PageFilters } from '$lib/utils/pageFilters';

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

	let sortField = $state<PageListParams['sort']>('order');
	let sortOrder = $state<'asc' | 'desc'>('asc');

	// Drag state
	let dragPage = $state<PageSummary | null>(null);
	// Absolute index of the row being dragged: its chunk stays mounted for the
	// whole drag, or the browser would never deliver its dragend.
	let dragIndex = $state<number | null>(null);
	let dropIndex = $state<number | null>(null);
	let saving = $state(false);

	// Search results are kept separate from the chunk store — search is a flat
	// view across the entire site (100 matches at a time, "Show more" for the
	// rest) and uses different filters than the normal list. Each keystroke
	// aborts the request before it.
	const search = createPageSearch({
		params: () => ({ lang: lang || undefined, translations: !!lang }),
	});

	// The search endpoint returns a flat array, so the active filters are
	// applied client-side here to keep search + filter consistent with the
	// browse mode (which filters server-side through streamConfig).
	const filteredSearchResults = $derived(search.results.filter((p) => matchesPageFilters(p, filters)));

	// ── Chunked listing ──────────────────────────────────────────────────────

	const chunkSize = $derived(prefs.pagesChunkSize);
	const streamConfig = $derived<StreamConfig>({
		sort: sortField || 'order',
		order: sortOrder,
		lang: lang || undefined,
		translations: lang ? true : undefined,
		...pageFilterStreamFields(filters),
	});
	const skey = $derived(streamKey(streamConfig, chunkSize));
	const total = $derived(pagesChunks.getTotal(skey));

	// Bootstrap chunk 1 whenever the stream key changes (new sort, lang, or
	// chunk size). The store dedupes if already loading.
	$effect(() => {
		// Track the stream key only. Wrap the actual store call in untrack:
		// ensureChunkForIndex reads `s.loading[page]` and `s.chunks[page]`
		// synchronously to dedupe, and those same fields are written when the
		// fetch settles — without untrack, every load would retrigger the
		// effect and fire another (cached) call, causing a thundering herd
		// that quickly trips rate limits.
		void skey;
		untrack(() => pagesChunks.ensureChunkForIndex(skey, streamConfig, chunkSize, 0));
	});

	interface ChunkBlock {
		page: number;
		startIndex: number;
		count: number;
		loaded: boolean;
		rows: PageSummary[];
	}

	// Each block hands out its chunk's own row array, so a newly loaded chunk
	// doesn't copy the rows of every chunk loaded before it.
	const chunkBlocks = $derived.by((): ChunkBlock[] => {
		if (total === null || total === 0) return [];
		const blocks: ChunkBlock[] = [];
		const totalPages = Math.ceil(total / chunkSize);
		for (let page = 1; page <= totalPages; page++) {
			const startIndex = (page - 1) * chunkSize;
			const count = Math.min(chunkSize, total - startIndex);
			const chunk = pagesChunks.getChunk(skey, page);
			blocks.push({ page, startIndex, count, loaded: chunk !== null, rows: chunk ?? [] });
		}
		return blocks;
	});

	const loadedCount = $derived.by(() => {
		let n = 0;
		for (const b of chunkBlocks) n += b.rows.length;
		return n;
	});

	const fullyLoaded = $derived(total !== null && loadedCount === total);

	/** Every loaded page, in absolute order. Only drag reorder needs it, and
	 *  only once every chunk is resident. */
	function loadedPages(): PageSummary[] {
		const out: PageSummary[] = [];
		for (const b of chunkBlocks) {
			if (b.loaded) out.push(...b.rows);
		}
		return out;
	}

	// Starting per-row height for sizing chunks that have never rendered, until
	// a rendered chunk gives the real one.
	const ROW_HEIGHT_PX = 52;

	// ── Windowing ────────────────────────────────────────────────────────────
	//
	// A loaded chunk only keeps its rows mounted while it is within
	// NEAR_MARGIN_PX of the visible part of the list; further away it is
	// swapped for a spacer of the height it last rendered at, so scrolling
	// through a thousand pages keeps a couple of hundred rows in the DOM
	// instead of all of them. The block wrappers themselves stay mounted and
	// keep their height, so the scroll position never moves.
	const NEAR_MARGIN_PX = 1500;
	let nearBlocks = $state<Record<number, boolean>>({});
	let blockHeights = $state<Record<number, number>>({});
	// Measured from rendered rows; sizes chunks that were never rendered.
	let rowHeight = $state(ROW_HEIGHT_PX);
	// A chunk scroll-restore needs mounted before the list has scrolled to it.
	let pinnedBlock = $state<number | null>(null);

	// A new stream starts with new blocks; the keyed wrappers below re-observe.
	$effect(() => {
		void skey;
		untrack(() => {
			nearBlocks = {};
			blockHeights = {};
		});
	});

	$effect(() => {
		if (pinnedBlock !== null && nearBlocks[pinnedBlock]) pinnedBlock = null;
	});

	function blockMounted(block: ChunkBlock): boolean {
		if (nearBlocks[block.page] || pinnedBlock === block.page) return true;
		return dragIndex !== null && dragIndex >= block.startIndex && dragIndex < block.startIndex + block.count;
	}

	function blockHeight(block: ChunkBlock): number {
		return blockHeights[block.page] ?? block.count * rowHeight;
	}

	/** The element the list scrolls in (the admin's <main>), or null for the window. */
	function scrollRoot(node: HTMLElement): HTMLElement | null {
		let cur: HTMLElement | null = node.parentElement;
		while (cur) {
			const overflowY = getComputedStyle(cur).overflowY;
			if (overflowY === 'auto' || overflowY === 'scroll') return cur;
			cur = cur.parentElement;
		}
		return null;
	}

	/**
	 * Action on each chunk's wrapper: reports whether the chunk is near the
	 * visible area, and records its rendered height while its rows are
	 * mounted. A chunk holding keyboard focus stays mounted.
	 */
	function observeBlock(node: HTMLElement, page: number) {
		let current = page;
		const io = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					const near = entry.isIntersecting || node.contains(document.activeElement);
					if (!!nearBlocks[current] !== near) nearBlocks[current] = near;
				}
			},
			{ root: scrollRoot(node), rootMargin: `${NEAR_MARGIN_PX}px 0px` },
		);
		io.observe(node);
		const ro = new ResizeObserver(() => {
			if (node.dataset.rendered !== 'true') return;
			const h = node.offsetHeight;
			if (h <= 0) return;
			if (blockHeights[current] !== h) blockHeights[current] = h;
			const rows = node.querySelectorAll('[data-page-route]').length;
			if (rows > 0) {
				const perRow = h / rows;
				if (Math.abs(perRow - rowHeight) > 0.5) rowHeight = perRow;
			}
		});
		ro.observe(node);
		return {
			update(next: number) { current = next; },
			destroy() { io.disconnect(); ro.disconnect(); },
		};
	}

	// ── Search (separate path — no chunking) ─────────────────────────────────

	$effect(() => {
		search.run(searchQuery);
	});
	$effect(() => () => search.dispose());
	// Keep search results current after an edit or on refocus; the browse
	// list refreshes itself through the chunk store.
	onMount(() => {
		const refresh = () => {
			if (searchQuery.trim()) search.refresh();
		};
		const unsubPages = invalidations.subscribe('pages:*', refresh);
		const unsubFocus = invalidations.subscribe('*:focus', refresh);
		return () => { unsubPages(); unsubFocus(); };
	});

	// ── Reorder mode: force-load every chunk so the full sibling list is
	//    available to reorganizePages. The setEffect runs both on toggle on
	//    and again if the stream key changes while reorder is active. ────────

	$effect(() => {
		if (!reorderMode) return;
		void skey;
		untrack(() => pagesChunks.ensureAllChunks(skey, streamConfig, chunkSize));
	});

	function toggleSort(field: PageListParams['sort']) {
		if (sortField === field) {
			sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
		} else {
			sortField = field;
			sortOrder = field === 'modified' || field === 'date' ? 'desc' : 'asc';
		}
		// stream key changes via $derived — the $effect above re-bootstraps.
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

	/** "Publish"/"Unpublish" plus the state the page is in, for the toggle's tooltip. */
	function togglePublishedLabel(page: PageSummary): string {
		return pageStatusToggleLabel(
			page,
			i18n.t(page.published ? 'ADMIN_NEXT.PAGES.UNPUBLISH' : 'ADMIN_NEXT.PAGES.PUBLISH'),
		);
	}

	function getParentRoute(page: PageSummary): string {
		const parts = page.route.split('/').filter(Boolean);
		if (parts.length <= 1) return '/';
		return '/' + parts.slice(0, -1).join('/');
	}

	function handleDragStart(e: DragEvent, page: PageSummary, index: number) {
		if (!reorderMode) return;
		dragPage = page;
		dragIndex = index;
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
		if (!fullyLoaded) {
			toast.error(i18n.t('ADMIN_NEXT.PAGES.REORDER_LOADING'));
			return;
		}

		const source = dragPage;
		dragIndex = null;
		const sourceParent = getParentRoute(source);
		const all = loadedPages();
		const target = all[targetIndex];
		const targetParent = getParentRoute(target);

		dragPage = null;
		dropIndex = null;

		if (sourceParent !== targetParent) {
			toast.error(i18n.t('ADMIN_NEXT.PAGES.REORDER_SAME_PARENT'));
			return;
		}

		const siblings = all.filter(p => getParentRoute(p) === sourceParent);
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
			toast.success(i18n.t('ADMIN_NEXT.TOASTS.ITEM_REORDERED', { name: source.title }));
			// invalidations.subscribe('pages:*', ...) inside the chunk store
			// already drops cached chunks; the bootstrap effect re-fires.
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.PAGES.REORDER_FAILED'));
		} finally {
			saving = false;
		}
	}

	function handleDragEnd() {
		dragPage = null;
		dragIndex = null;
		dropIndex = null;
	}

	// Refetch on tab refocus — invalidations.subscribe wires pages:* already.
	// Focus events arrive separately; just nudge the bootstrap.
	onMount(() => {
		// One-shot scroll restore: if the user just came back from editing a
		// page, jump straight to the chunk containing that route and scroll
		// the row to the top of the scroll container. Clears the flag so a
		// subsequent fresh visit lands at the top.
		const FOCUS_KEY = 'grav_admin_pages_focus';
		const focusRoute = sessionStorage.getItem(FOCUS_KEY);
		if (focusRoute) {
			sessionStorage.removeItem(FOCUS_KEY);
			(async () => {
				try {
					const index = await pagesChunks.ensureChunkForRoute(skey, streamConfig, chunkSize, focusRoute);
					// Its chunk is far from the top the list opens at, so keep
					// it mounted until the scroll brings it into range.
					if (index !== null) pinnedBlock = Math.floor(index / chunkSize) + 1;
					await tick();
					await new Promise(res => requestAnimationFrame(() => res(null)));
					scrollRouteIntoView(focusRoute);
				} catch { /* row may no longer exist */ }
				finally {
					// Normally released as soon as the chunk reports itself near
					// (the effect below); this only catches a scroll that failed.
					setTimeout(() => { pinnedBlock = null; }, 2000);
				}
			})();
		}
	});

	/**
	 * Scroll the page list so the row matching `route` lands at the top of
	 * its nearest scrollable ancestor. Used for "land on the page you just
	 * edited" navigation restore.
	 */
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
		// Subtract any sticky-pinned toolbar that overlaps the top of the
		// scrollable area, so the restored row lands just below it.
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

	function computeStickyTopOffset(scroller: HTMLElement): number {
		const sticky = scroller.querySelectorAll<HTMLElement>('.sticky');
		if (sticky.length === 0) return 0;
		const scrollerTop = scroller.getBoundingClientRect().top;
		let maxBottom = scrollerTop;
		for (const el of sticky) {
			if (getComputedStyle(el).position !== 'sticky') continue;
			const r = el.getBoundingClientRect();
			if (Math.abs(r.top - scrollerTop) > 2) continue;
			if (r.bottom > maxBottom) maxBottom = r.bottom;
		}
		return maxBottom - scrollerTop;
	}

	/**
	 * Action: load the chunk's data when the placeholder gets within
	 * roughly one-chunk-of-rows of the viewport. We also fire the
	 * immediately-adjacent chunks (one above, one below) so a fast scroll
	 * past this placeholder still leaves the surrounding rows resident —
	 * that's the "preload as you approach" behaviour the user expects.
	 */
	function observeChunkPlaceholder(
		node: HTMLElement,
		params: { startIndex: number; key: string; config: StreamConfig; perPage: number },
	) {
		let current = params;
		// rootMargin is a generous symmetric buffer (~ one chunk worth of pixels)
		// so loads start before the user reaches the empty zone in either
		// direction. The exact value isn't critical because we also fire
		// neighbour chunks below.
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;
					const idx = current.startIndex;
					const pp = current.perPage;
					// Self + one chunk back + one chunk forward. The store
					// dedupes already-loaded / in-flight chunks.
					pagesChunks.ensureChunkForIndex(current.key, current.config, pp, idx);
					if (idx >= pp) {
						pagesChunks.ensureChunkForIndex(current.key, current.config, pp, idx - pp);
					}
					pagesChunks.ensureChunkForIndex(current.key, current.config, pp, idx + pp);
				}
			},
			{ root: scrollRoot(node), rootMargin: '1500px 0px' },
		);
		observer.observe(node);
		return {
			update(next: { startIndex: number; key: string; config: StreamConfig; perPage: number }) {
				current = next;
			},
			destroy() { observer.disconnect(); },
		};
	}

</script>

{#snippet sortHeader(label: string, field: PageListParams['sort'], align: string = 'left')}
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

{#snippet pageRow(page: PageSummary, index: number)}
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
	{#if reorderMode && dropIndex === index && dragPage?.route !== page.route}
		<div class="mx-4 h-0.5 rounded bg-primary"></div>
	{/if}
	<div
		data-page-route={page.route}
		class="group flex items-center gap-2 border-b border-border/50 px-2 py-2 transition-colors sm:px-4
			{dragPage?.route === page.route ? 'opacity-30' : 'hover:bg-accent/50'}
			{saving ? 'pointer-events-none' : ''}"
		draggable={reorderMode}
		ondragstart={(e) => handleDragStart(e, page, index)}
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
			<File size={14} class="shrink-0 {page.visible ? 'text-primary/70' : 'text-muted-foreground'}" />
			<a
				class="min-w-0 flex-1 text-start"
				href="{base}/pages/edit{pageApiRoute(page)}"
				onclick={linkClick(() => onEdit(pageApiRoute(page)))}
				draggable={!reorderMode}
			>
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
			</a>
		</div>

		{#if !reorderMode}
			<div class="hidden w-36 text-center md:block lg:w-44" title={page.template}>
				<Badge variant="outline" class="max-w-full"><span class="block truncate">{page.template}</span></Badge>
			</div>
			<div class="flex w-6 justify-center">
				{#if onTogglePublished && pageCan(page, 'publish')}
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
					{#if onDelete && pageCan(page, 'delete')}
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
		{:else}
			<div class="w-32 text-end text-[0.6875rem] text-muted-foreground">
				{getParentRoute(page)}
			</div>
		{/if}
	</div>
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
	{:else}
		<div class="w-32 text-end">
			<span class="text-[0.6875rem] font-medium tracking-wider text-muted-foreground">{i18n.t('ADMIN_NEXT.PAGES.HEADER_PARENT')}</span>
		</div>
	{/if}
</div>

{#if searchQuery.trim()}
	<!-- Search mode: flat list, no chunking -->
	{#if search.loading}
		<div class="py-12 text-center text-sm text-muted-foreground">
			<Loader2 size={16} class="mx-auto mb-2 animate-spin" />
			{i18n.t('ADMIN_NEXT.PAGES.LOADING')}
		</div>
	{:else if filteredSearchResults.length === 0}
		<div class="py-12 text-center text-sm text-muted-foreground">
			{i18n.t('ADMIN_NEXT.PAGES.NO_MATCH')}
		</div>
	{:else}
		{#each filteredSearchResults as page, index (pageApiRoute(page))}
			{@render pageRow(page, index)}
		{/each}
	{/if}
	{#if !search.loading && search.hasMore}
		<div class="flex items-center gap-3 px-4 py-2 text-[0.6875rem] text-muted-foreground">
			<span>{i18n.t('ADMIN_NEXT.PAGES.SEARCH_SHOWING', { shown: search.results.length, total: search.total })}</span>
			<button
				type="button"
				class="font-medium text-primary hover:underline disabled:opacity-50"
				disabled={search.loadingMore}
				onclick={() => search.more()}
			>
				{i18n.t('ADMIN_NEXT.PAGES.SEARCH_SHOW_MORE')}
			</button>
		</div>
	{/if}
{:else if total === null}
	<!-- Initial bootstrap of the first chunk -->
	<div class="py-12 text-center text-sm text-muted-foreground">
		<Loader2 size={16} class="mx-auto mb-2 animate-spin" />
		{i18n.t('ADMIN_NEXT.PAGES.LOADING')}
	</div>
{:else if total === 0}
	<div class="py-12 text-center text-sm text-muted-foreground">
		{i18n.t('ADMIN_NEXT.PAGES.NO_PAGES')}
	</div>
{:else}
	{#if reorderMode && !fullyLoaded}
		<div class="border-b border-border bg-muted/30 px-4 py-2 text-[0.6875rem] text-muted-foreground">
			<Loader2 size={12} class="me-1.5 inline animate-spin" />
			{i18n.t('ADMIN_NEXT.PAGES.REORDER_LOADING_ALL')}
		</div>
	{/if}
	{#key skey}
		{#each chunkBlocks as block (block.page)}
			{@const mounted = block.loaded && blockMounted(block)}
			<!-- The wrapper always stays: it watches whether the chunk is near the
			     visible area, and keeps the chunk's height while its rows are
			     swapped out for a spacer. -->
			<div data-rendered={mounted ? 'true' : 'false'} use:observeBlock={block.page}>
				{#if mounted}
					<!-- Key on the structural route (raw_route), which is unique by construction.
					     Two siblings can share a public route when one declares an explicit `slug:`
					     in its frontmatter, and a duplicate key aborts the whole listing (admin2#154). -->
					{#each block.rows as page, i (pageApiRoute(page))}
						{@render pageRow(page, block.startIndex + i)}
					{/each}
				{:else if block.loaded}
					<div aria-hidden="true" style="height: {blockHeight(block)}px;"></div>
				{:else}
					<div
						class="flex items-center justify-center border-b border-border/50 text-[0.75rem] text-muted-foreground/60"
						style="min-height: {block.count * rowHeight}px;"
						use:observeChunkPlaceholder={{ startIndex: block.startIndex, key: skey, config: streamConfig, perPage: chunkSize }}
					>
						<Loader2 size={14} class="me-2 animate-spin" />
						{i18n.t('ADMIN_NEXT.PAGES.LOADING_CHUNK', { from: block.startIndex + 1, to: block.startIndex + block.count })}
					</div>
				{/if}
			</div>
		{/each}
	{/key}

	<!-- Footer: progress indicator -->
	<div class="flex items-center gap-3 border-t border-border px-4 py-2 text-[0.6875rem] text-muted-foreground">
		<span>{i18n.t('ADMIN_NEXT.PAGES.LOADED_OF', { n: loadedCount, total })}</span>
	</div>
{/if}
