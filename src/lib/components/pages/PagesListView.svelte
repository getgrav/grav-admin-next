<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { reorganizePages, searchPages, pageApiRoute } from '$lib/api/endpoints/pages';
	import type { PageSummary, PageListParams, ReorganizeOperation } from '$lib/api/endpoints/pages';
	import { onMount, tick, untrack } from 'svelte';
	import { Badge } from '$lib/components/ui/badge';
	import TranslationBadges from '$lib/components/ui/TranslationBadges.svelte';
	import { contentLang } from '$lib/stores/contentLang.svelte';
	import { toast } from 'svelte-sonner';
	import {
		ArrowUp, ArrowDown, File, Loader2, Trash2,
		GripVertical, CircleCheck, CircleDashed
	} from 'lucide-svelte';
	import { prefs } from '$lib/stores/preferences.svelte';
	import { pagesChunks, streamKey, type StreamConfig } from '$lib/stores/pagesChunks.svelte';

	interface Props {
		searchQuery?: string;
		reorderMode?: boolean;
		lang?: string;
		onEdit: (route: string) => void;
		onDelete?: (page: PageSummary) => void;
	}

	let { searchQuery = '', reorderMode = false, lang, onEdit, onDelete }: Props = $props();

	let sortField = $state<PageListParams['sort']>('order');
	let sortOrder = $state<'asc' | 'desc'>('asc');

	// Drag state
	let dragPage = $state<PageSummary | null>(null);
	let dropIndex = $state<number | null>(null);
	let saving = $state(false);

	// Search results are kept separate from the chunk store — search is a flat,
	// non-paginated view across the entire site and uses different filters than
	// the normal list.
	let searchResults = $state<PageSummary[]>([]);
	let searchLoading = $state(false);

	// ── Chunked listing ──────────────────────────────────────────────────────

	const chunkSize = $derived(prefs.pagesChunkSize);
	const streamConfig = $derived<StreamConfig>({
		sort: sortField || 'order',
		order: sortOrder,
		lang: lang || undefined,
		translations: lang ? true : undefined,
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

	const chunkBlocks = $derived.by((): ChunkBlock[] => {
		if (total === null || total === 0) return [];
		const blocks: ChunkBlock[] = [];
		const totalPages = Math.ceil(total / chunkSize);
		for (let page = 1; page <= totalPages; page++) {
			const startIndex = (page - 1) * chunkSize;
			const count = Math.min(chunkSize, total - startIndex);
			const loaded = pagesChunks.isChunkLoaded(skey, startIndex);
			const rows: PageSummary[] = [];
			if (loaded) {
				for (let i = 0; i < count; i++) {
					const r = pagesChunks.getRow(skey, startIndex + i);
					if (r) rows.push(r);
				}
			}
			blocks.push({ page, startIndex, count, loaded, rows });
		}
		return blocks;
	});

	/** Flat list of currently-loaded pages, in absolute order. Used by drag
	 *  reorder (which requires the full sibling sequence to be resident). */
	const loadedPages = $derived.by((): PageSummary[] => {
		const out: PageSummary[] = [];
		for (const b of chunkBlocks) {
			if (b.loaded) out.push(...b.rows);
		}
		return out;
	});

	const fullyLoaded = $derived(total !== null && loadedPages.length === total);

	// ── Search (separate path — no chunking) ─────────────────────────────────

	let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	let prevSearch = searchQuery;
	$effect(() => {
		if (searchQuery === prevSearch) return;
		prevSearch = searchQuery;
		if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
		const q = searchQuery.trim();
		if (!q) { searchResults = []; return; }
		searchDebounceTimer = setTimeout(async () => {
			searchLoading = true;
			try {
				searchResults = await searchPages(q, {
					lang: lang || undefined,
					translations: !!lang,
				});
			} catch { /* handled upstream */ }
			finally { searchLoading = false; }
		}, 250);
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
		if (!fullyLoaded) {
			toast.error(i18n.t('ADMIN_NEXT.PAGES.REORDER_LOADING'));
			return;
		}

		const source = dragPage;
		const sourceParent = getParentRoute(source);
		const target = loadedPages[targetIndex];
		const targetParent = getParentRoute(target);

		dragPage = null;
		dropIndex = null;

		if (sourceParent !== targetParent) {
			toast.error(i18n.t('ADMIN_NEXT.PAGES.REORDER_SAME_PARENT'));
			return;
		}

		const siblings = loadedPages.filter(p => getParentRoute(p) === sourceParent);
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
					await pagesChunks.ensureChunkForRoute(skey, streamConfig, chunkSize, focusRoute);
					await tick();
					await new Promise(res => requestAnimationFrame(() => res(null)));
					scrollRouteIntoView(focusRoute);
				} catch { /* row may no longer exist */ }
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
			{ rootMargin: '1500px 0px' },
		);
		observer.observe(node);
		return {
			update(next: { startIndex: number; key: string; config: StreamConfig; perPage: number }) {
				current = next;
			},
			destroy() { observer.disconnect(); },
		};
	}

	// Rough per-row height used to size unloaded chunk placeholders, so the
	// scrollbar position approximates the final layout. Exact pixel-accuracy
	// isn't required — bidirectional loading keeps things stable.
	const ROW_HEIGHT_PX = 52;
</script>

{#snippet sortHeader(label: string, field: PageListParams['sort'], align: string = 'left')}
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
		class="group relative flex items-center gap-2 border-b border-border/50 px-2 py-2 transition-colors sm:px-4
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
			<File size={14} class="shrink-0 {page.visible ? 'text-primary/70' : 'text-muted-foreground'}" />
			<button class="min-w-0 flex-1 text-start" onclick={() => onEdit(pageApiRoute(page))}>
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
			<div class="flex w-6 justify-center" title={page.published ? 'Published' : 'Draft'}>
				{#if page.published}
					<CircleCheck size={14} class="text-green-500" aria-label={i18n.t('ADMIN_NEXT.PAGES.PUBLISHED')} />
				{:else}
					<CircleDashed size={14} class="text-muted-foreground" aria-label="Draft" />
				{/if}
			</div>
			<div class="hidden w-20 text-end text-[0.6875rem] text-muted-foreground sm:block">
				{formatDate(page.modified)}
			</div>
			{#if onDelete}
			<button
				class="absolute right-1 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded bg-background/80 text-muted-foreground opacity-0 backdrop-blur transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 sm:right-2"
				onclick={() => onDelete(page)}
				title={i18n.t('ADMIN_NEXT.DELETE')}
			>
				<Trash2 size={12} />
			</button>
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
	<div class="min-w-0 flex-1">{@render sortHeader('Title', 'title')}</div>
	{#if !reorderMode}
		<div class="hidden w-20 text-center md:block">
			<span class="text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">{i18n.t('ADMIN_NEXT.PAGES.HEADER_TEMPLATE')}</span>
		</div>
		<div class="w-6 text-center" title={i18n.t('ADMIN_NEXT.PAGES.HEADER_STATUS')}>
			<span class="text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">·</span>
		</div>
		<div class="hidden w-20 text-end sm:block">{@render sortHeader('Modified', 'modified', 'right')}</div>
	{:else}
		<div class="w-32 text-end">
			<span class="text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">{i18n.t('ADMIN_NEXT.PAGES.HEADER_PARENT')}</span>
		</div>
	{/if}
</div>

{#if searchQuery.trim()}
	<!-- Search mode: flat list, no chunking -->
	{#if searchLoading}
		<div class="py-12 text-center text-sm text-muted-foreground">
			<Loader2 size={16} class="mx-auto mb-2 animate-spin" />
			{i18n.t('ADMIN_NEXT.PAGES.LOADING')}
		</div>
	{:else if searchResults.length === 0}
		<div class="py-12 text-center text-sm text-muted-foreground">
			{i18n.t('ADMIN_NEXT.PAGES.NO_MATCH')}
		</div>
	{:else}
		{#each searchResults as page, index (page.route)}
			{@render pageRow(page, index)}
		{/each}
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
	{#each chunkBlocks as block (block.page)}
		{#if block.loaded}
			{#each block.rows as page, i (page.route)}
				{@render pageRow(page, block.startIndex + i)}
			{/each}
		{:else}
			<div
				class="flex items-center justify-center border-b border-border/50 text-[0.75rem] text-muted-foreground/60"
				style="min-height: {block.count * ROW_HEIGHT_PX}px;"
				use:observeChunkPlaceholder={{ startIndex: block.startIndex, key: skey, config: streamConfig, perPage: chunkSize }}
			>
				<Loader2 size={14} class="me-2 animate-spin" />
				{i18n.t('ADMIN_NEXT.PAGES.LOADING_CHUNK', { from: block.startIndex + 1, to: block.startIndex + block.count })}
			</div>
		{/if}
	{/each}

	<!-- Footer: progress indicator -->
	<div class="flex items-center gap-3 border-t border-border px-4 py-2 text-[0.6875rem] text-muted-foreground">
		<span>{i18n.t('ADMIN_NEXT.PAGES.LOADED_OF', { n: loadedPages.length, total })}</span>
	</div>
{/if}
