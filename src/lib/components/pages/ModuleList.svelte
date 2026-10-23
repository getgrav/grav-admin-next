<script lang="ts">
	// The modules of a modular page, listed in its own editor: each one's
	// name and type, in page order, with a link to its editor and a publish
	// toggle. Dragging a row (or Alt+Up / Alt+Down on its handle) reorders the
	// modules the same way the Tree and Columns views reorder pages, through
	// `POST /pages/reorganize`. "Add module" opens the new-module form with
	// this page preset as the parent.
	import { onMount, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { ChevronDown, GripVertical, Loader2, Plus } from 'lucide-svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { prefs } from '$lib/stores/preferences.svelte';
	import { contentLang } from '$lib/stores/contentLang.svelte';
	import { invalidations } from '$lib/stores/invalidation.svelte';
	import { getChildren, updatePage, reorganizePages, pageApiRoute, type PageSummary } from '$lib/api/endpoints/pages';
	import { getPageTypes, type PageType } from '$lib/api/endpoints/blueprints';
	import { buildMoveOps, fullInsertIndex } from '$lib/utils/reorganize-ops';
	import { isModule, isModularPage, moduleTypeLabel, stepInsertIndex } from '$lib/utils/modules';
	import { pageEditUrl } from '$lib/utils/pageEditUrl';
	import { pageCan } from '$lib/utils/permissions';
	import { pageStatusToggleLabel } from '$lib/utils/pageStatus';
	import { Button } from '$lib/components/ui/button';
	import HelpTip from '$lib/components/ui/HelpTip.svelte';
	import PageStatusIndicator from './PageStatusIndicator.svelte';
	import DirectionalIcon from '$lib/components/ui/DirectionalIcon.svelte';

	interface Props {
		/** The page being edited, as the editor loaded it. */
		page: PageSummary;
	}

	let { page }: Props = $props();

	const CARD_ID = 'modules';
	const route = $derived(pageApiRoute(page));
	const lang = $derived(contentLang.enabled ? contentLang.activeLang : undefined);

	let children = $state<PageSummary[]>([]);
	let types = $state<PageType[]>([]);
	let loaded = $state(false);
	let loading = $state(false);
	let saving = $state(false);
	let togglingRoutes = $state<Set<string>>(new Set());

	const modules = $derived(children.filter(isModule));
	const shown = $derived(isModularPage(page));
	const collapsed = $derived(prefs.isEditorCardCollapsed(CARD_ID));
	const canAdd = $derived(pageCan(page, 'create'));
	const canReorder = $derived(pageCan(page, 'update') && modules.length > 1);

	/** Bumped per load so a slow reply for a page the editor has left is dropped. */
	let loadId = 0;

	async function load(): Promise<void> {
		const id = ++loadId;
		const forRoute = route;
		// A page with no children can still be a modular page waiting for its
		// first module; the list then only offers "Add module".
		if (!shown || !page.has_children) {
			children = [];
			loaded = true;
			return;
		}
		loading = !loaded;
		try {
			const rows = await getChildren(forRoute, 'order', 'asc', lang, undefined, { summary: true });
			if (id !== loadId) return;
			children = rows;
		} catch {
			if (id !== loadId) return;
			children = [];
		} finally {
			if (id === loadId) {
				loading = false;
				loaded = true;
			}
		}
	}

	$effect(() => {
		// Reload when the editor moves to another page or language.
		void route;
		void lang;
		void page.has_children;
		void shown;
		untrack(() => { void load(); });
	});

	onMount(() => {
		getPageTypes(true).then((t) => { types = t; }).catch(() => { /* names fall back to the template */ });
		// A module saved, added, moved or deleted anywhere refreshes the list.
		return invalidations.subscribe('pages:*', () => { if (shown) void load(); });
	});

	function addModule(): void {
		goto(`${base}/pages/new?kind=module&parent=${encodeURIComponent(route)}`);
	}

	async function togglePublished(module: PageSummary): Promise<void> {
		const moduleRoute = pageApiRoute(module);
		if (togglingRoutes.has(moduleRoute)) return;
		const next = !module.published;
		togglingRoutes = new Set([...togglingRoutes, moduleRoute]);
		try {
			await updatePage(moduleRoute, { published: next }, undefined, lang);
			children = children.map((c) =>
				pageApiRoute(c) === moduleRoute
					? { ...c, published: next, publish_state: next ? 'published' : 'unpublished' }
					: c,
			);
			toast.success(
				next
					? i18n.t('ADMIN_NEXT.TOASTS.PAGE_PUBLISHED', { name: module.title })
					: i18n.t('ADMIN_NEXT.TOASTS.PAGE_UNPUBLISHED', { name: module.title }),
			);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			toast.error(i18n.t('ADMIN_NEXT.TOASTS.PAGE_PUBLISH_FAILED', { detail: msg }));
		} finally {
			togglingRoutes = new Set([...togglingRoutes].filter((r) => r !== moduleRoute));
		}
	}

	/**
	 * Move a module so it lands in front of the module shown at `visibleIndex`
	 * (or last, at `modules.length`). The numbering is worked out against every
	 * child of the page, so a child that is not a module keeps its number.
	 */
	async function moveModule(module: PageSummary, visibleIndex: number): Promise<void> {
		if (saving) return;
		const moduleRoute = pageApiRoute(module);
		const all = children.map((c) => ({ route: pageApiRoute(c), order: c.order }));
		const insertAt = fullInsertIndex(modules.map(pageApiRoute), all.map((c) => c.route), visibleIndex);
		const ops = buildMoveOps({
			page: { route: moduleRoute, order: module.order },
			fromParent: route,
			toParent: route,
			siblings: all,
			insertAt,
		});
		if (ops.length === 0) {
			if (!module.order) {
				toast.info(i18n.t('ADMIN_NEXT.PAGES.MOVE_UNNUMBERED_KEEPS_NAME_ORDER', { title: module.title }));
			}
			return;
		}

		saving = true;
		try {
			await reorganizePages(ops);
			toast.success(i18n.t('ADMIN_NEXT.TOASTS.ITEM_MOVED', { name: module.title }));
			await load();
		} catch (err: unknown) {
			const message = err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : '';
			toast.error(message || i18n.t('ADMIN_NEXT.PAGES.PAGES_TREE_VIEW.FAILED_TO_REORGANIZE_PAGES'));
		} finally {
			saving = false;
		}
	}

	// ── Drag and drop ───────────────────────────────────────────────
	let dragRoute = $state<string | null>(null);
	/** Index in `modules` the dragged row would land in front of. */
	let dropIndex = $state<number | null>(null);

	function handleDragStart(e: DragEvent, module: PageSummary): void {
		if (!canReorder || saving) return;
		dragRoute = pageApiRoute(module);
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', dragRoute);
		}
	}

	function handleDragOver(e: DragEvent, index: number): void {
		if (!dragRoute) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		// The lower half of a row drops after it.
		const row = e.currentTarget as HTMLElement;
		const rect = row.getBoundingClientRect();
		dropIndex = e.clientY > rect.top + rect.height / 2 ? index + 1 : index;
	}

	function handleDrop(e: DragEvent): void {
		e.preventDefault();
		const module = modules.find((m) => pageApiRoute(m) === dragRoute);
		const at = dropIndex;
		resetDrag();
		if (module && at !== null) void moveModule(module, at);
	}

	function resetDrag(): void {
		dragRoute = null;
		dropIndex = null;
	}

	function handleHandleKeydown(e: KeyboardEvent, module: PageSummary, index: number): void {
		if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
		e.preventDefault();
		const at = stepInsertIndex(index, modules.length, e.key === 'ArrowUp' ? -1 : 1);
		if (at !== null) void moveModule(module, at);
	}

	function toggleLabel(module: PageSummary): string {
		return pageStatusToggleLabel(module, i18n.t(module.published ? 'ADMIN_NEXT.PAGES.UNPUBLISH' : 'ADMIN_NEXT.PAGES.PUBLISH'));
	}
</script>

{#if shown}
	<section class="rounded-lg border border-border bg-card" aria-labelledby="module-list-title">
		<div class="flex items-center justify-between gap-2 px-4 py-3">
			<div class="flex min-w-0 items-center gap-1">
				<h3 id="module-list-title" class="text-sm font-semibold text-foreground">
					<button
						type="button"
						class="flex items-center gap-2 text-start"
						aria-expanded={!collapsed}
						onclick={() => prefs.toggleEditorCard(CARD_ID)}
					>
						<ChevronDown size={14} class="shrink-0 text-muted-foreground transition-transform {collapsed ? 'rtl:rotate-90 -rotate-90' : ''}" />
						<span>{i18n.t('ADMIN_NEXT.PAGES.MODULES.TITLE')}</span>
						{#if modules.length > 0}
							<span class="font-normal text-muted-foreground">({modules.length})</span>
						{/if}
					</button>
				</h3>
				<HelpTip label={i18n.t('ADMIN_NEXT.PAGES.MODULES.TITLE')}>
					{i18n.t('ADMIN_NEXT.PAGES.MODULES.HELP')}
				</HelpTip>
			</div>
			{#if canAdd}
				<Button size="sm" variant="outline" onclick={addModule}>
					<Plus size={14} />
					{i18n.t('ADMIN_NEXT.PAGES.MODULES.ADD')}
				</Button>
			{/if}
		</div>

		{#if !collapsed}
			<div class="border-t border-border">
				{#if loading}
					<div class="flex items-center justify-center gap-2 py-5 text-sm text-muted-foreground">
						<Loader2 size={14} class="animate-spin" />
						{i18n.t('ADMIN_NEXT.PAGES.LOADING')}
					</div>
				{:else if modules.length === 0}
					<p class="px-4 py-5 text-center text-sm text-muted-foreground">{i18n.t('ADMIN_NEXT.PAGES.MODULES.EMPTY')}</p>
				{:else}
					<ol class="divide-y divide-border/60 {saving ? 'pointer-events-none opacity-60' : ''}" ondragleave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) dropIndex = null; }}>
						{#each modules as module, index (pageApiRoute(module))}
							{@const moduleRoute = pageApiRoute(module)}
							{@const dragging = dragRoute === moduleRoute}
							<li
								class="relative flex items-center gap-2 px-2 py-1.5 transition-colors sm:px-3 {dragging ? 'opacity-40' : 'hover:bg-accent/50'}"
								draggable={canReorder && !saving}
								ondragstart={(e) => handleDragStart(e, module)}
								ondragover={(e) => handleDragOver(e, index)}
								ondrop={handleDrop}
								ondragend={resetDrag}
							>
								{#if dropIndex === index && !dragging}
									<div class="pointer-events-none absolute inset-x-2 -top-px h-0.5 rounded bg-primary"></div>
								{/if}
								{#if dropIndex === index + 1 && index === modules.length - 1 && !dragging}
									<div class="pointer-events-none absolute inset-x-2 -bottom-px h-0.5 rounded bg-primary"></div>
								{/if}

								{#if canReorder}
									<button
										type="button"
										class="flex h-7 w-5 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground/50 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:cursor-grabbing"
										title={i18n.t('ADMIN_NEXT.PAGES.MODULES.MOVE', { title: module.title })}
										aria-label={i18n.t('ADMIN_NEXT.PAGES.MODULES.MOVE', { title: module.title })}
										onkeydown={(e) => handleHandleKeydown(e, module, index)}
									>
										<GripVertical size={14} />
									</button>
								{/if}

								<a
									class="group flex min-w-0 flex-1 items-center gap-3 rounded py-1 ps-1"
									href={pageEditUrl(moduleRoute)}
									draggable="false"
								>
									<span class="min-w-0 truncate text-sm font-medium text-foreground group-hover:text-primary">{module.title}</span>
									<span class="ms-auto hidden shrink-0 truncate text-xs text-muted-foreground sm:inline">{moduleTypeLabel(module.template, types)}</span>
								</a>

								{#if pageCan(module, 'publish')}
									<button
										type="button"
										class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors hover:bg-accent disabled:opacity-50"
										onclick={() => togglePublished(module)}
										disabled={togglingRoutes.has(moduleRoute)}
										title={toggleLabel(module)}
										aria-label={toggleLabel(module)}
									>
										<PageStatusIndicator page={module} decorative />
									</button>
								{:else}
									<span class="inline-flex h-7 w-7 shrink-0 items-center justify-center">
										<PageStatusIndicator page={module} />
									</span>
								{/if}

								<a
									class="inline-flex h-7 w-5 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
									href={pageEditUrl(moduleRoute)}
									draggable="false"
									tabindex="-1"
									aria-hidden="true"
								>
									<DirectionalIcon name="chevron-forward" size={14} />
								</a>
							</li>
						{/each}
					</ol>
				{/if}
			</div>
		{/if}
	</section>
{/if}
