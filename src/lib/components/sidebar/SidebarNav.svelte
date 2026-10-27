<script lang="ts">
	import { tick } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { page } from '$app/state';
	import { afterNavigate } from '$app/navigation';
	import { base } from '$app/paths';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { prefs } from '$lib/stores/preferences.svelte';
	import { flushNow } from '$lib/stores/_serverSync';
	import { sidebarStore } from '$lib/stores/sidebar.svelte';
	import { navBadges } from '$lib/stores/navBadges.svelte';
	import { dialogs } from '$lib/stores/dialogs.svelte';
	import { saveSitePreferences, type PreferenceValues } from '$lib/api/endpoints/preferences';
	import type { SidebarChild, SidebarItem } from '$lib/api/endpoints/sidebar';
	import { faIconClass } from '$lib/utils/fa-icon';
	import { can } from '$lib/utils/permissions';
	import { isActiveRoute } from '$lib/utils/nav-active';
	import {
		DIVIDER_ID,
		PLUGIN_PREFIX,
		asSidebarLayout,
		layoutToSave,
		moveSidebarItem,
		resolveSidebarOrder,
		sameIds,
		sameSidebar,
		shownShortcuts,
		visibleSidebarIds,
		withShortcut,
	} from '$lib/utils/sidebar-layout';
	import { Button } from '$lib/components/ui/button';
	import {
		LayoutDashboard, FileText, Image, Users, Puzzle, Palette, Settings, Wrench, Languages,
		GripVertical, Eye, EyeOff, Globe, RotateCcw, Undo2, ChevronRight, ChevronDown, Star,
	} from 'lucide-svelte';

	interface Props {
		collapsed: boolean;
		/** Edit mode: reorder and hide items instead of following links. */
		editing: boolean;
		/** Called when a link is followed, so the mobile menu can close. */
		onnavigate: () => void;
	}
	let { collapsed, editing = $bindable(), onnavigate }: Props = $props();

	interface CoreItem {
		id: string;
		href: string;
		labelKey: string;
		icon: typeof LayoutDashboard;
		badgeKey?: string;
		permission?: string;
	}

	type Entry =
		| { id: string; kind: 'core'; item: CoreItem }
		| { id: string; kind: 'plugin'; item: SidebarItem }
		| { id: string; kind: 'divider' };

	// `labelKey` is resolved via i18n.t() at render time so the sidebar
	// follows the active admin language. Plugin-supplied sidebar items keep
	// arriving as pre-translated plain text from the API server. The ids are
	// what a saved sidebar layout refers to, so they never change.
	const coreItems: CoreItem[] = [
		{ id: 'dashboard', href: `${base}/`, labelKey: 'ADMIN_NEXT.NAV.DASHBOARD', icon: LayoutDashboard },
		{ id: 'configuration', href: `${base}/config`, labelKey: 'ADMIN_NEXT.NAV.CONFIGURATION', icon: Settings, permission: 'api.config.read' },
		{ id: 'users', href: `${base}/users`, labelKey: 'ADMIN_NEXT.NAV.USERS', icon: Users, badgeKey: 'users', permission: 'api.users.read' },
		{ id: 'pages', href: `${base}/pages`, labelKey: 'ADMIN_NEXT.NAV.PAGES', icon: FileText, badgeKey: 'pages', permission: 'api.pages.read' },
		{ id: 'media', href: `${base}/media`, labelKey: 'ADMIN_NEXT.NAV.MEDIA', icon: Image, badgeKey: 'media', permission: 'api.media.read' },
		{ id: 'plugins', href: `${base}/plugins`, labelKey: 'ADMIN_NEXT.NAV.PLUGINS', icon: Puzzle, badgeKey: 'plugins', permission: 'api.gpm.read' },
		{ id: 'themes', href: `${base}/themes`, labelKey: 'ADMIN_NEXT.NAV.THEMES', icon: Palette, badgeKey: 'themes', permission: 'api.gpm.read' },
		{ id: 'translations', href: `${base}/translations`, labelKey: 'ADMIN_NEXT.NAV.TRANSLATIONS', icon: Languages, permission: 'api.translations.read' },
		{ id: 'tools', href: `${base}/tools`, labelKey: 'ADMIN_NEXT.NAV.TOOLS', icon: Wrench, permission: 'api.system.read' },
	];

	const entries = $derived.by(() => {
		const map = new Map<string, Entry>();
		for (const item of coreItems) {
			if (!item.permission || can(item.permission)) map.set(item.id, { id: item.id, kind: 'core', item });
		}
		map.set(DIVIDER_ID, { id: DIVIDER_ID, kind: 'divider' });
		for (const item of sidebarStore.items) {
			// Footer items are drawn above Settings by AppShell.
			if (item.placement === 'footer') continue;
			const id = PLUGIN_PREFIX + item.id;
			map.set(id, { id, kind: 'plugin', item });
		}
		return map;
	});

	/** The built-in order: core items, the divider, then plugin items by priority. */
	const defaults = $derived([...entries.keys()]);

	/** The shortcuts a plugin item offers. */
	function childrenOf(entry: Entry): SidebarChild[] {
		return entry.kind === 'plugin' && Array.isArray(entry.item.children) ? entry.item.children : [];
	}
	/** Every plugin item's shortcuts, by layout id, for comparing layouts. */
	const childrenByItem = $derived(Object.fromEntries([...entries.values()].map((e) => [e.id, childrenOf(e)]).filter(([, c]) => c.length > 0)));

	const layout = $derived(asSidebarLayout(prefs.sidebarLayout));
	const shownIds = $derived(visibleSidebarIds(resolveSidebarOrder(defaults, layout.order), layout.hidden));

	// ── Edit mode ────────────────────────────────────────────────────────
	let draftOrder = $state<string[]>([]);
	let draftHidden = $state<string[]>([]);
	let draftShortcuts = $state<Record<string, string[]>>({});
	/** Plugin items whose shortcut list is open in edit mode. */
	let expanded = $state<string[]>([]);
	let saving = $state(false);
	let announcement = $state('');
	// Re-resolved so a plugin item that loads mid-edit still shows up.
	const editOrder = $derived(resolveSidebarOrder(defaults, draftOrder));
	const isBuiltIn = $derived(sameIds(editOrder, defaults) && !draftHidden.some((id) => entries.has(id)) && Object.keys(draftShortcuts).length === 0);
	const hasOwnLayout = $derived(prefs.isUserOverridden('sidebarLayout'));

	let wasEditing = false;
	$effect.pre(() => {
		if (editing && !wasEditing) {
			draftOrder = resolveSidebarOrder(defaults, layout.order);
			draftHidden = layout.hidden.filter((id) => entries.has(id));
			draftShortcuts = { ...layout.shortcuts };
			expanded = [];
			announcement = '';
		}
		wasEditing = editing;
	});

	function label(entry: Entry): string {
		if (entry.kind === 'core') return i18n.t(entry.item.labelKey);
		if (entry.kind === 'plugin') return entry.item.label;
		return i18n.t('ADMIN_NEXT.SIDEBAR_EDIT.DIVIDER');
	}

	function toggleHidden(id: string) {
		draftHidden = draftHidden.includes(id) ? draftHidden.filter((h) => h !== id) : [...draftHidden, id];
	}

	function toggleShortcut(entry: Entry, id: string) {
		const on = !shownShortcuts(draftShortcuts, entry.id, childrenOf(entry)).includes(id);
		draftShortcuts = withShortcut(draftShortcuts, entry.id, childrenOf(entry), id, on);
	}

	function toggleExpanded(id: string) {
		expanded = expanded.includes(id) ? expanded.filter((e) => e !== id) : [...expanded, id];
	}

	function cancel() {
		endDrag();
		editing = false;
	}

	async function save() {
		const next = layoutToSave(defaults, editOrder, draftHidden, draftShortcuts);
		const siteDefault = asSidebarLayout(prefs.effectiveDefault('sidebarLayout'));
		saving = true;
		try {
			// The same sidebar as the site's is no layout of your own: you keep
			// following the site's when it changes.
			if (sameSidebar(defaults, next, siteDefault, childrenByItem)) {
				if (hasOwnLayout) prefs.resetToSiteDefault('sidebarLayout');
			} else {
				prefs.sidebarLayout = next;
			}
			await flushNow();
			toast.success(i18n.t('ADMIN_NEXT.SIDEBAR_EDIT.SAVED'));
			editing = false;
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.SIDEBAR_EDIT.SAVE_FAILED'));
		} finally {
			saving = false;
		}
	}

	async function saveForEveryone() {
		const ok = await dialogs.confirm({
			title: i18n.t('ADMIN_NEXT.SIDEBAR_EDIT.SAVE_FOR_EVERYONE_TITLE'),
			message: i18n.t('ADMIN_NEXT.SIDEBAR_EDIT.SAVE_FOR_EVERYONE_MESSAGE'),
			confirmLabel: i18n.t('ADMIN_NEXT.SIDEBAR_EDIT.SAVE_FOR_EVERYONE'),
		});
		if (!ok) return;
		const next = layoutToSave(defaults, editOrder, draftHidden, draftShortcuts);
		saving = true;
		try {
			// `null` drops the site's layout, so the built-in order applies.
			const sidebarLayout = next.order.length === 0 && next.hidden.length === 0 && Object.keys(next.shortcuts).length === 0 ? null : next;
			prefs.init(await saveSitePreferences({ sidebarLayout } as unknown as Partial<PreferenceValues>));
			// Your own layout would hide the one you just set for everyone.
			if (prefs.isUserOverridden('sidebarLayout')) {
				prefs.resetToSiteDefault('sidebarLayout');
				await flushNow();
			}
			toast.success(i18n.t('ADMIN_NEXT.SIDEBAR_EDIT.SITE_SAVED'));
			editing = false;
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.SIDEBAR_EDIT.SAVE_FAILED'));
		} finally {
			saving = false;
		}
	}

	async function useSiteDefault() {
		saving = true;
		try {
			prefs.resetToSiteDefault('sidebarLayout');
			await flushNow();
			toast.success(i18n.t('ADMIN_NEXT.SIDEBAR_EDIT.RESET_DONE'));
			editing = false;
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.SIDEBAR_EDIT.SAVE_FAILED'));
		} finally {
			saving = false;
		}
	}

	function restoreBuiltIn() {
		draftOrder = [...defaults];
		draftHidden = [];
		draftShortcuts = {};
	}

	// ── Dragging ─────────────────────────────────────────────────────────
	// Pointer events, so it works with a finger as well as a mouse. A mouse
	// can drag the whole row; a finger drags the handle, so swiping the rest
	// of the list still scrolls it.
	let navEl = $state<HTMLElement>();
	let listEl = $state<HTMLUListElement>();
	let dragId = $state<string | null>(null);
	let pointerY = 0;
	let frame = 0;

	function startDrag(e: PointerEvent, id: string) {
		if (!editing || saving || e.button !== 0) return;
		const target = e.target as HTMLElement;
		if (target.closest('[data-sidebar-eye]')) return;
		if (e.pointerType !== 'mouse' && !target.closest('[data-sidebar-grip]')) return;
		e.preventDefault();
		dragId = id;
		pointerY = e.clientY;
		window.addEventListener('pointermove', onDragMove);
		window.addEventListener('pointerup', endDrag);
		window.addEventListener('pointercancel', endDrag);
		frame = requestAnimationFrame(autoScroll);
	}

	function onDragMove(e: PointerEvent) {
		pointerY = e.clientY;
		dropAt(pointerY);
	}

	function endDrag() {
		dragId = null;
		window.removeEventListener('pointermove', onDragMove);
		window.removeEventListener('pointerup', endDrag);
		window.removeEventListener('pointercancel', endDrag);
		cancelAnimationFrame(frame);
	}

	$effect(() => () => endDrag());

	/**
	 * Move the dragged item once the pointer passes the middle of another row.
	 * Going by the middle, not the row's edge, keeps a short row (the divider)
	 * from swapping back and forth under a still pointer.
	 */
	function dropAt(y: number) {
		if (!dragId || !listEl) return;
		const from = editOrder.indexOf(dragId);
		let down = -1;
		let up = -1;
		for (const row of listEl.querySelectorAll<HTMLElement>('[data-sidebar-index]')) {
			const i = Number(row.dataset.sidebarIndex);
			const r = row.getBoundingClientRect();
			const middle = r.top + r.height / 2;
			if (i > from && y > middle) down = Math.max(down, i);
			if (i < from && y < middle && (up === -1 || i < up)) up = i;
		}
		const to = down !== -1 ? down : up;
		if (to !== -1) draftOrder = moveSidebarItem(editOrder, dragId, to);
	}

	/** Scroll the list while the pointer is held near its top or bottom edge. */
	function autoScroll() {
		if (!dragId || !navEl) return;
		const r = navEl.getBoundingClientRect();
		const edge = 40;
		let dy = 0;
		if (pointerY < r.top + edge) dy = -Math.ceil((r.top + edge - pointerY) / 4);
		else if (pointerY > r.bottom - edge) dy = Math.ceil((pointerY - (r.bottom - edge)) / 4);
		if (dy !== 0) {
			const before = navEl.scrollTop;
			navEl.scrollTop += dy;
			if (navEl.scrollTop !== before) dropAt(pointerY);
		}
		frame = requestAnimationFrame(autoScroll);
	}

	async function onHandleKey(e: KeyboardEvent, entry: Entry) {
		if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
		e.preventDefault();
		const from = editOrder.indexOf(entry.id);
		const to = from + (e.key === 'ArrowUp' ? -1 : 1);
		if (to < 0 || to >= editOrder.length) return;
		draftOrder = moveSidebarItem(editOrder, entry.id, to);
		announcement = i18n.t('ADMIN_NEXT.SIDEBAR_EDIT.MOVED', { label: label(entry), position: to + 1, total: editOrder.length });
		// Moving the row can drop focus; put it back on the handle.
		await tick();
		listEl?.querySelector<HTMLElement>(`[data-sidebar-grip="${CSS.escape(entry.id)}"]`)?.focus();
	}

	function onEditKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && !dragId) cancel();
	}

	function isActive(href: string): boolean {
		return isActiveRoute(page.url.pathname, href, base, page.url.search);
	}

	// A plugin page moves between its own screens by changing the `#` part,
	// which SvelteKit doesn't report, so sub-items follow it here.
	let hash = $state(typeof location === 'undefined' ? '' : location.hash);
	$effect(() => {
		const sync = () => { hash = location.hash; };
		window.addEventListener('hashchange', sync);
		return () => window.removeEventListener('hashchange', sync);
	});
	afterNavigate(() => { hash = location.hash; });

	/** A sub-item is active on its own screen and the screens below it (`#/orders/1024`). */
	function isChildActive(route: string): boolean {
		const at = route.indexOf('#');
		const path = at === -1 ? route : route.slice(0, at);
		if (!isActive(`${base}${path}`)) return false;
		if (at === -1) return true;
		const want = route.slice(at);
		return hash === want || hash.startsWith(`${want}/`) || hash.startsWith(`${want}?`);
	}

	function shownChildren(entry: Entry) {
		const shown = shownShortcuts(layout.shortcuts, entry.id, childrenOf(entry));
		return childrenOf(entry).filter((c) => shown.includes(c.id));
	}

	const linkClass = 'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[0.8125rem] font-medium transition-colors';
	const activeClass = 'bg-primary/10 text-primary';
	const idleClass = 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground';
</script>

{#snippet entryIcon(entry: Entry, active: boolean)}
	{#if entry.kind === 'core'}
		<entry.item.icon size={16} strokeWidth={active ? 2 : 1.5} class="shrink-0" />
	{:else if entry.kind === 'plugin'}
		<i class="{faIconClass(entry.item.icon)} w-4 shrink-0 text-center text-[0.8125rem]"></i>
	{/if}
{/snippet}

<nav bind:this={navEl} class="flex-1 overflow-y-auto px-2 py-2" aria-label={editing ? i18n.t('ADMIN_NEXT.SIDEBAR_EDIT.CUSTOMIZE') : undefined}>
	{#if !editing}
		<ul class="space-y-0.5">
			{#each shownIds as id (id)}
				{@const entry = entries.get(id)}
				{#if entry?.kind === 'divider'}
					<li class="my-1 border-t border-sidebar-border"></li>
				{:else if entry?.kind === 'core'}
					{@const active = isActive(entry.item.href)}
					<li>
						<a href={entry.item.href} class="{linkClass} {active ? activeClass : idleClass}"
							onclick={onnavigate}
							title={collapsed ? label(entry) : undefined}>
							{@render entryIcon(entry, active)}
							{#if !collapsed}
								<span>{label(entry)}</span>
								{#if entry.item.badgeKey}
									{@const total = navBadges.counts[entry.item.badgeKey]}
									{@const upd = navBadges.updates[entry.item.badgeKey] ?? 0}
									{#if total != null || upd > 0}
										<!-- Joined capsule: update count (left) fused to the muted total
										     count (right). Collapses to just the total when there are
										     no updates, matching the classic admin sidebar badges. -->
										<span class="ms-auto inline-flex items-center overflow-hidden rounded-full text-[0.625rem] font-semibold">
											{#if upd > 0}
												<!-- Accent, not amber: an available update is an invitation to act,
												     not a problem, so it uses the same colour as the action buttons. -->
												<span class="bg-primary px-1.5 py-0.5 text-primary-foreground" title={i18n.t('ADMIN_NEXT.NAV.UPDATES_AVAILABLE', { count: upd })}>{upd}</span>
											{/if}
											{#if total != null}
												<span class="bg-sidebar-accent px-1.5 py-0.5 text-sidebar-foreground">{total}</span>
											{/if}
										</span>
									{/if}
								{/if}
							{/if}
						</a>
					</li>
				{:else if entry?.kind === 'plugin'}
					{@const href = `${base}${entry.item.route}`}
					{@const subItems = collapsed ? [] : shownChildren(entry)}
					{@const open = subItems.length > 0 && prefs.isSidebarGroupOpen(id)}
					<!-- The item itself stays plain while one of its own shortcuts, on show, is the active one. -->
					{@const active = isActive(href) && !(open && subItems.some((c) => isChildActive(c.route)))}
					<li>
						<div class="flex items-center gap-0.5">
							<a {href} class="{linkClass} min-w-0 flex-1 {active ? activeClass : idleClass}"
								onclick={onnavigate}
								title={collapsed ? label(entry) : undefined}>
								{@render entryIcon(entry, active)}
								{#if !collapsed}
									<span class="truncate">{label(entry)}</span>
									{@const badge = sidebarStore.badges[entry.item.id] ?? entry.item.badge}
									{#if badge != null}
										<span class="ms-auto rounded-full bg-primary/10 px-1.5 py-0.5 text-[0.625rem] font-semibold text-primary">{badge}</span>
									{/if}
								{/if}
							</a>
							{#if subItems.length > 0}
								<button type="button"
									class="flex h-7 w-6 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
									aria-expanded={open}
									aria-label={i18n.t(open ? 'ADMIN_NEXT.SIDEBAR_EDIT.FOLD' : 'ADMIN_NEXT.SIDEBAR_EDIT.UNFOLD', { label: label(entry) })}
									title={i18n.t(open ? 'ADMIN_NEXT.SIDEBAR_EDIT.FOLD' : 'ADMIN_NEXT.SIDEBAR_EDIT.UNFOLD', { label: label(entry) })}
									onclick={() => prefs.toggleSidebarGroup(id)}>
									<ChevronDown size={14} class="transition-transform {open ? '' : '-rotate-90 rtl:rotate-90'}" />
								</button>
							{/if}
						</div>
						{#if open}
							<ul class="ms-[1.15rem] mt-0.5 space-y-0.5 border-s border-sidebar-border ps-1.5">
								{#each subItems as child (child.id)}
									{@const subActive = isChildActive(child.route)}
									<li>
										<a href="{base}{child.route}"
											class="flex items-center gap-2 rounded-md px-2 py-1 text-[0.75rem] font-medium transition-colors {subActive ? activeClass : idleClass}"
											onclick={onnavigate}>
											{#if child.icon}<i class="{faIconClass(child.icon)} w-3.5 shrink-0 text-center text-[0.6875rem]"></i>{/if}
											<span class="truncate">{child.label}</span>
										</a>
									</li>
								{/each}
							</ul>
						{/if}
					</li>
				{/if}
			{/each}
		</ul>
	{:else}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div onkeydown={onEditKey}>
			<p class="px-1 pb-2 text-[0.6875rem] leading-snug text-sidebar-foreground/60">{i18n.t('ADMIN_NEXT.SIDEBAR_EDIT.HINT')}</p>
			<ul bind:this={listEl} class="space-y-0.5 {saving ? 'pointer-events-none opacity-60' : ''}">
				{#each editOrder as id, index (id)}
					{@const entry = entries.get(id)}
					{#if entry}
						{@const hidden = draftHidden.includes(id)}
						{@const name = label(entry)}
						<li data-sidebar-index={index}
							class="flex items-center gap-1.5 rounded-md py-1 pe-1 ps-0.5 text-[0.8125rem] font-medium select-none
								{dragId === id ? 'bg-sidebar-accent ring-1 ring-primary/40' : 'hover:bg-sidebar-accent/60'}
								{dragId ? 'cursor-grabbing' : 'cursor-grab'}"
							onpointerdown={(e) => startDrag(e, id)}>
							<button type="button" data-sidebar-grip={id}
								class="flex h-6 w-5 shrink-0 touch-none items-center justify-center rounded text-sidebar-foreground/40 hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
								aria-label={i18n.t('ADMIN_NEXT.SIDEBAR_EDIT.MOVE', { label: name })}
								title={i18n.t('ADMIN_NEXT.SIDEBAR_EDIT.MOVE', { label: name })}
								onkeydown={(e) => onHandleKey(e, entry)}>
								<GripVertical size={14} />
							</button>
							<span class="flex min-w-0 flex-1 items-center gap-2.5 {hidden ? 'text-sidebar-foreground/40' : 'text-sidebar-foreground/80'}">
								{#if entry.kind === 'divider'}
									<span class="h-px flex-1 border-t border-dashed border-sidebar-foreground/30"></span>
									<span class="shrink-0 text-[0.6875rem] font-normal">{name}</span>
									<span class="h-px w-3 border-t border-dashed border-sidebar-foreground/30"></span>
								{:else}
									{@render entryIcon(entry, false)}
									<span class="truncate {hidden ? 'line-through' : ''}">{name}</span>
								{/if}
							</span>
							<button type="button" data-sidebar-eye
								class="flex h-6 w-6 shrink-0 items-center justify-center rounded text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground"
								aria-pressed={hidden}
								aria-label={i18n.t(hidden ? 'ADMIN_NEXT.SIDEBAR_EDIT.SHOW' : 'ADMIN_NEXT.SIDEBAR_EDIT.HIDE', { label: name })}
								title={i18n.t(hidden ? 'ADMIN_NEXT.SIDEBAR_EDIT.SHOW' : 'ADMIN_NEXT.SIDEBAR_EDIT.HIDE', { label: name })}
								onclick={() => toggleHidden(id)}>
								{#if hidden}<EyeOff size={13} />{:else}<Eye size={13} />{/if}
							</button>
						</li>
						{@const subItems = childrenOf(entry)}
						{#if subItems.length > 0 && !hidden}
							{@const open = expanded.includes(id)}
							{@const starred = shownShortcuts(draftShortcuts, id, subItems)}
							<li class="ms-6">
								<button type="button" class="flex w-full items-center gap-1 rounded px-1 py-0.5 text-start text-[0.6875rem] text-sidebar-foreground/60 hover:text-sidebar-foreground"
									aria-expanded={open}
									onclick={() => toggleExpanded(id)}>
									<ChevronRight size={12} class="shrink-0 transition-transform {open ? 'rotate-90' : ''} rtl:-scale-x-100" />
									{i18n.t('ADMIN_NEXT.SIDEBAR_EDIT.SUB_ITEMS', { count: starred.length, total: subItems.length })}
								</button>
								{#if open}
									<ul class="mt-0.5 space-y-0.5 border-s border-sidebar-border ps-1.5">
										{#each subItems as child (child.id)}
											{@const on = starred.includes(child.id)}
											<li class="flex items-center gap-1.5 rounded-md py-0.5 pe-1 ps-1.5 text-[0.75rem] font-medium {on ? 'text-sidebar-foreground/80' : 'text-sidebar-foreground/40'}">
												<span class="min-w-0 flex-1 truncate">{child.label}</span>
												<button type="button"
													class="flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-sidebar-accent {on ? 'text-primary' : 'text-sidebar-foreground/50 hover:text-sidebar-foreground'}"
													aria-pressed={on}
													aria-label={i18n.t(on ? 'ADMIN_NEXT.SIDEBAR_EDIT.UNSTAR' : 'ADMIN_NEXT.SIDEBAR_EDIT.STAR', { label: child.label })}
													title={i18n.t(on ? 'ADMIN_NEXT.SIDEBAR_EDIT.UNSTAR' : 'ADMIN_NEXT.SIDEBAR_EDIT.STAR', { label: child.label })}
													onclick={() => toggleShortcut(entry, child.id)}>
													<Star size={13} fill={on ? 'currentColor' : 'none'} />
												</button>
											</li>
										{/each}
									</ul>
								{/if}
							</li>
						{/if}
					{/if}
				{/each}
			</ul>
			<div class="sr-only" aria-live="polite">{announcement}</div>

			<!-- Kept in view while a long list scrolls on a phone. -->
			<div class="sticky bottom-0 -mx-2 mt-2 space-y-1.5 border-t border-sidebar-border bg-sidebar px-2 pt-2 pb-1">
				<div class="flex gap-1.5">
					<Button variant="outline" size="sm" class="flex-1" onclick={cancel} disabled={saving}>{i18n.t('ADMIN_NEXT.CANCEL')}</Button>
					<Button size="sm" class="flex-1" onclick={save} disabled={saving}>{i18n.t('ADMIN_NEXT.SAVE')}</Button>
				</div>
				{#if prefs.canEditSite}
					<Button variant="outline" size="sm" class="w-full" onclick={saveForEveryone} disabled={saving}
						title={i18n.t('ADMIN_NEXT.SIDEBAR_EDIT.SAVE_FOR_EVERYONE_HINT')}>
						<Globe size={13} />
						{i18n.t('ADMIN_NEXT.SIDEBAR_EDIT.SAVE_FOR_EVERYONE')}
					</Button>
				{/if}
				{#if !isBuiltIn || hasOwnLayout}
					<div class="flex flex-wrap justify-center gap-x-3 gap-y-0.5 pt-0.5">
						{#if !isBuiltIn}
							<button type="button" class="inline-flex items-center gap-1 text-[0.6875rem] text-sidebar-foreground/60 hover:text-sidebar-foreground hover:underline" onclick={restoreBuiltIn} disabled={saving}>
								<RotateCcw size={11} />
								{i18n.t('ADMIN_NEXT.SIDEBAR_EDIT.RESTORE_BUILT_IN')}
							</button>
						{/if}
						{#if hasOwnLayout}
							<button type="button" class="inline-flex items-center gap-1 text-[0.6875rem] text-sidebar-foreground/60 hover:text-sidebar-foreground hover:underline" onclick={useSiteDefault} disabled={saving}>
								<Undo2 size={11} />
								{i18n.t('ADMIN_NEXT.SIDEBAR_EDIT.USE_SITE_DEFAULT')}
							</button>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</nav>
