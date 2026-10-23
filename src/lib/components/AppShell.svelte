<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { auth } from '$lib/stores/auth.svelte';
	import { authSession } from '$lib/stores/auth-session.svelte';
	import { prefs } from '$lib/stores/preferences.svelte';
	import { theme } from '$lib/stores/theme.svelte';
	import { logout, refreshMe } from '$lib/api/auth';
	import { flushNow } from '$lib/stores/_serverSync';
	import { api } from '$lib/api/client';
	import { invalidations } from '$lib/stores/invalidation.svelte';
	import type { InvalidationEvent } from '$lib/api/types';
	import { resolveAvatarUrl } from '$lib/utils/avatar';
	import BrandLogo from '$lib/components/ui/BrandLogo.svelte';
	import EnvironmentSwitcher from '$lib/components/ui/EnvironmentSwitcher.svelte';
	import CacheClearButton from '$lib/components/menubar/CacheClearButton.svelte';
	import MenubarLinks from '$lib/components/menubar/MenubarLinks.svelte';
	import PluginMenubarItems from '$lib/components/menubar/PluginMenubarItems.svelte';
	import ViewSiteButton from '$lib/components/menubar/ViewSiteButton.svelte';
	import { menubar } from '$lib/stores/menubar.svelte';
	import { resetBoot } from '$lib/stores/boot';
	import { sidebarStore } from '$lib/stores/sidebar.svelte';
	import { navBadges } from '$lib/stores/navBadges.svelte';
	import SidebarNav from '$lib/components/sidebar/SidebarNav.svelte';
	import { floatingWidgetStore } from '$lib/stores/floatingWidgets.svelte';
	import FloatingWidgetLoader from '$lib/components/floating-widgets/FloatingWidgetLoader.svelte';
	import DebugPanel from '$lib/components/debug/DebugPanel.svelte';
	import { contextPanelStore } from '$lib/stores/contextPanels.svelte';
	import ContextPanelHost from '$lib/components/context-panels/ContextPanelHost.svelte';
	import DemoModeBanner from '$lib/components/DemoModeBanner.svelte';
	import ReauthModal from '$lib/components/auth/ReauthModal.svelte';
	import { pageEditorBar } from '$lib/stores/pageEditorBar.svelte';
	import PresenceAvatars from '$lib/components/sync/PresenceAvatars.svelte';
	import SyncStatusBadge from '$lib/components/sync/SyncStatusBadge.svelte';
	import type { Snippet } from 'svelte';
	import { isActiveRoute } from '$lib/utils/nav-active';
	import {
		FileText, SlidersHorizontal, Pencil,
		Sun, Moon, Menu, Code, CodeXml, Heart
	} from 'lucide-svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { branding } from '$lib/stores/branding.svelte';
	import { creditParts } from '$lib/utils/credit-parts';

	interface Props { children: Snippet; }
	let { children }: Props = $props();

	// Menubar zones (admin2#81). The store fetches once; AppShell drives loading
	// and decides which zone wrappers/divider to render based on what's present.
	const startMenubarItems = $derived(menubar.forPlacement('start'));
	const endMenubarItems = $derived(menubar.forPlacement('end'));
	// The end-zone "custom" group is plugin buttons that opted in plus the user's
	// own quick links — separated from the core actions by a divider.
	const hasEndCustom = $derived(endMenubarItems.length > 0 || prefs.menubarLinks.length > 0);
	// The first load of each boot-time store takes its part of the single
	// /admin-next/boot answer (see $lib/stores/boot); reloads go direct.
	$effect(() => { menubar.load(true); });

	// Proactive token refresh + focus checking is handled by authSession.
	// It decodes the JWT exp claim, refreshes at exp-60s, and opens ReauthModal
	// on hard expiry or refresh failure.
	$effect(() => {
		if (auth.isAuthenticated) {
			authSession.start();
		} else {
			authSession.stop();
		}
	});

	// Load plugin sidebar items, floating widgets, and nav badges on authentication
	$effect(() => {
		if (auth.isAuthenticated) {
			sidebarStore.load(true).then(() => sidebarStore.fetchBadges());
			floatingWidgetStore.load(true);
			contextPanelStore.load(true);
			navBadges.load();
		} else {
			resetBoot();
			sidebarStore.clear();
			floatingWidgetStore.clear();
			contextPanelStore.clear();
			navBadges.clear();
		}
	});

	// Refresh user profile and permissions on mount
	$effect(() => {
		if (auth.isAuthenticated && auth.username) {
			refreshMe(true);
		}
	});

	// Refresh sidebar version labels when admin/grav itself is updated
	$effect(() => {
		if (!auth.isAuthenticated) return;
		const unsubs = [
			invalidations.subscribe('plugins:update:admin', () => refreshMe()),
			invalidations.subscribe('plugins:update:admin2', () => refreshMe()),
			invalidations.subscribe('plugins:update:api', () => refreshMe()),
			invalidations.subscribe('grav:update', () => refreshMe()),
		];
		return () => { for (const u of unsubs) u(); };
	});

	// Keep plugin-contributed boot-time stores and badge counts in sync with
	// server-side invalidation events. A single API response often emits
	// several related tags at once (e.g. `plugins:create:foo, plugins:list,
	// gpm:update`); coalesce per-reload-target so each store reloads at most
	// once per microtask burst.
	$effect(() => {
		if (!auth.isAuthenticated) return;

		const pending = new Set<() => void>();
		let scheduled = false;
		const schedule = (fn: () => void) => {
			pending.add(fn);
			if (scheduled) return;
			scheduled = true;
			queueMicrotask(() => {
				scheduled = false;
				const run = Array.from(pending);
				pending.clear();
				for (const f of run) f();
			});
		};

		// Stable task references — `schedule()` coalesces by identity, so the
		// SAME function object must be passed each time for a burst of related
		// invalidation tags (e.g. `pages:update` + `pages:list` from one save) to
		// collapse into a single run instead of one fetch per tag.
		const doReloadBadges = () => navBadges.load();
		const doReloadSidebar = () => sidebarStore.load().then(() => sidebarStore.fetchBadges());
		const doReloadSidebarBadges = () => sidebarStore.fetchBadges();
		const doReloadWidgets = () => floatingWidgetStore.load();
		const doReloadPanels = () => contextPanelStore.load();

		const reloadBadges = () => schedule(doReloadBadges);
		// Re-fetch plugin sidebar items, then their live badge counts.
		const reloadSidebar = () => schedule(doReloadSidebar);
		// Re-fetch only the live sidebar badge counts (no item reload).
		const reloadSidebarBadges = () => schedule(doReloadSidebarBadges);
		const reloadWidgets = () => schedule(doReloadWidgets);
		const reloadPanels = () => schedule(doReloadPanels);

		// Plugin/theme install/remove/enable/disable can add or drop sidebar
		// items, menubar entries, floating widgets, and context panels — and
		// it always shifts the plugin/theme badge counts.
		const onPluginOrTheme = () => {
			reloadSidebar();
			reloadWidgets();
			reloadPanels();
			reloadBadges();
		};

		// Actions that change how many pages, users or media files exist. A
		// bare `list` event arrives only when nothing more specific came with
		// it (a batch operation), so it may have changed counts too.
		const COUNT_CHANGING_ACTIONS = new Set(['create', 'delete', 'move', 'copy', 'list']);
		const onContentChange = (event: InvalidationEvent) => {
			if (!COUNT_CHANGING_ACTIONS.has(event.action)) return;
			reloadBadges();
			reloadSidebarBadges();
		};

		// Live push: a plugin page/widget can update its own sidebar badge
		// without a round-trip via `grav:sidebar:badge` ({ id, count }).
		const onSidebarBadge = (e: Event) => {
			const detail = (e as CustomEvent).detail;
			if (detail && detail.id != null && detail.count != null) {
				sidebarStore.setBadge(detail.id, detail.count);
			}
		};
		window.addEventListener('grav:sidebar:badge', onSidebarBadge);

		const unsubs = [
			invalidations.subscribe('plugins:*', onPluginOrTheme),
			invalidations.subscribe('themes:*', onPluginOrTheme),
			invalidations.subscribe('gpm:*', onPluginOrTheme),
			// Content changes that add or remove things refresh nav badges and
			// any sidebar badge counts derived from that data. A plain save
			// (autosave included) changes no count, and /dashboard/stats walks
			// every page, so updates and reorders leave the badges alone.
			invalidations.subscribe('pages:*', onContentChange),
			invalidations.subscribe('users:*', onContentChange),
			invalidations.subscribe('media:*', onContentChange),
			invalidations.subscribe('config:*', reloadSidebarBadges),
		];
		return () => {
			for (const u of unsubs) u();
			window.removeEventListener('grav:sidebar:badge', onSidebarBadge);
		};
	});

	// The collapsed sidebar is remembered per browser. It only applies from the
	// `lg` breakpoint up, where the toggle is shown: below it the sidebar is the
	// slide-out menu, which has no toggle and must open at full width.
	const desktop = new MediaQuery('min-width: 1024px');
	// Editing the sidebar's order needs the labels, so it shows at full width.
	let sidebarEditing = $state(false);
	const collapsed = $derived(prefs.sidebarCollapsed && desktop.current && !sidebarEditing);
	let mobileOpen = $state(false);
	$effect(() => { if (!auth.isAuthenticated) sidebarEditing = false; });

	// "Grav was </> with ♥ by Trilby Media." The icons and the company link are
	// placed where the translation puts their placeholders.
	const credit = $derived(creditParts(i18n.t, 'ADMIN_NEXT.APP_SHELL.MADE_BY', ['code', 'love', 'company']));

	const settingsItem = { href: `${base}/settings`, labelKey: 'ADMIN_NEXT.NAV.SETTINGS', icon: SlidersHorizontal };

	function isActive(href: string): boolean {
		return isActiveRoute(page.url.pathname, href, base, page.url.search);
	}

	async function handleLogout() {
		// Flush any queued preference patches (e.g. an in-debounce language
		// change) before clearing auth. Without this, a user who picks a new
		// admin language and clicks Sign Out within ~200ms loses the change —
		// the debounced PATCH fires after auth is gone and silently fails.
		try { await flushNow(); } catch { /* best-effort */ }
		await logout();
		goto(`${base}/login`);
	}

	const avatarSrc = $derived(
		resolveAvatarUrl(auth.avatarUrl || null, auth.email || null, auth.fullname || null, auth.username)
	);
	const fallbackAvatarSrc = $derived(
		resolveAvatarUrl(null, auth.email || null, auth.fullname || null, auth.username)
	);

	function handleAvatarError(e: Event) {
		const img = e.target as HTMLImageElement;
		if (img.src !== fallbackAvatarSrc) {
			img.src = fallbackAvatarSrc;
		}
	}
</script>

<div class="flex h-screen overflow-hidden bg-background">
	{#if mobileOpen}
		<button class="fixed inset-0 z-30 bg-black/50 lg:hidden" onclick={() => mobileOpen = false} aria-label={i18n.t('ADMIN_NEXT.APP_SHELL.CLOSE_MENU')}></button>
	{/if}

	<!-- Sidebar. In RTL the border lives on the inline-end (left visually) and
		the mobile offscreen slide flips to the right edge. `border-e` is the
		inline-end border (right in LTR, left in RTL).
		The mobile slide-off is scoped to `max-lg:` because the `rtl:` variant
		uses a `[dir="rtl"]` attribute selector that outranks a bare `lg:` media
		query — without `max-lg:` the rule still wins at desktop and pushes the
		sidebar off-screen there too. -->
	<aside class="fixed z-40 flex h-full flex-col border-e border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-200 lg:relative lg:z-auto
		{collapsed ? 'w-[52px]' : 'w-56'}
		{mobileOpen ? 'translate-x-0' : 'max-lg:-translate-x-full max-lg:rtl:translate-x-full lg:translate-x-0'}">

		<div class="flex h-12 items-center border-b border-sidebar-border {collapsed ? 'justify-center px-2' : 'px-3'}">
			<BrandLogo size="sidebar" showLabel={!collapsed} />
		</div>

		<SidebarNav {collapsed} bind:editing={sidebarEditing} onnavigate={() => mobileOpen = false} />

		<!-- Settings link -->
		<div class="border-t border-sidebar-border px-2 pt-2">
			<a href={settingsItem.href}
				class="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[0.8125rem] font-medium transition-colors
					{isActive(settingsItem.href)
						? 'bg-primary/10 text-primary'
						: 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}"
				onclick={() => mobileOpen = false}
				title={collapsed ? i18n.t(settingsItem.labelKey) : undefined}>
				<settingsItem.icon size={16} strokeWidth={isActive(settingsItem.href) ? 2 : 1.5} />
				{#if !collapsed}<span>{i18n.t(settingsItem.labelKey)}</span>{/if}
			</a>
		</div>

		<!-- User profile -->
		<div class="border-t border-sidebar-border px-2 py-2">
			{#if collapsed}
				<a href="{base}/users/{auth.username}" class="flex items-center justify-center rounded-md p-1.5 transition-colors hover:bg-sidebar-accent" title={auth.fullname || auth.username}>
					<img
						src={avatarSrc}
						alt={auth.fullname || auth.username}
						class="h-7 w-7 max-w-none shrink-0 rounded-full object-cover"
						onerror={handleAvatarError}
					/>
				</a>
			{:else}
				<div class="flex items-center gap-2.5 rounded-md px-2 py-1.5">
					<a href="{base}/users/{auth.username}" class="shrink-0">
						<img
							src={avatarSrc}
							alt={auth.fullname || auth.username}
							class="h-8 w-8 rounded-full object-cover"
							onerror={handleAvatarError}
						/>
					</a>
					<div class="min-w-0 flex-1">
						<a href="{base}/users/{auth.username}" class="block truncate text-[0.8125rem] font-medium text-foreground hover:underline">
							{auth.fullname || auth.username}
						</a>
					</div>
					<button
						class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
						onclick={handleLogout}
						title={i18n.t('ADMIN_NEXT.SIGN_OUT')}
					>
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2" />
							<path d="M9 12h12l-3 -3" />
							<path d="M18 15l3 -3" />
						</svg>
					</button>
				</div>
			{/if}
		</div>

		<!-- Versions, credit + Collapse toggle -->
		<div class="border-t border-sidebar-border {collapsed ? 'px-2 py-1.5' : 'px-4 pt-1.5 pb-2'}">
			{#if collapsed && branding.showCredit}
				<a href="https://trilby.media" target="_blank" rel="noopener"
					class="group mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-md text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent"
					title={i18n.t('ADMIN_NEXT.APP_SHELL.MADE_BY_PLAIN')}
					aria-label={i18n.t('ADMIN_NEXT.APP_SHELL.MADE_BY_PLAIN')}>
					<Heart size={14} class="fill-current text-rose-500/70 transition-colors group-hover:text-rose-500" aria-hidden="true" />
				</a>
			{/if}
			<div class="flex items-center gap-2">
				{#if !collapsed && (auth.gravVersion || auth.adminVersion)}
					<div class="min-w-0 flex-1 text-xs leading-tight">
						{#if auth.gravVersion}<span class="text-sidebar-foreground/60">{i18n.t('ADMIN_NEXT.APP_SHELL.GRAV_VERSION', { version: auth.gravVersion })}</span>{/if}
						{#if auth.gravVersion && auth.adminVersion}<span class="text-sidebar-foreground/30" aria-hidden="true"> · </span>{/if}
						{#if auth.adminVersion}<span class="whitespace-nowrap text-sidebar-foreground/50">{i18n.t('ADMIN_NEXT.APP_SHELL.ADMIN_VERSION', { version: auth.adminVersion })}</span>{/if}
					</div>
				{/if}
				{#if !collapsed && !sidebarEditing}
					<button
						class="ms-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-md p-1.5 text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
						onclick={() => sidebarEditing = true}
						title={i18n.t('ADMIN_NEXT.SIDEBAR_EDIT.CUSTOMIZE')}
						aria-label={i18n.t('ADMIN_NEXT.SIDEBAR_EDIT.CUSTOMIZE')}>
						<Pencil size={15} />
					</button>
				{/if}
				<button
					class="{collapsed || sidebarEditing ? 'ms-auto' : ''} hidden h-7 w-7 shrink-0 items-center justify-center rounded-md p-1.5 text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground lg:flex {collapsed ? 'mx-auto' : ''}"
					onclick={() => prefs.sidebarCollapsed = !collapsed}
					aria-label={collapsed ? i18n.t('ADMIN_NEXT.EXPAND_SIDEBAR') : i18n.t('ADMIN_NEXT.COLLAPSE_SIDEBAR')}>
					{#if collapsed}
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M20 12l-10 0" />
							<path d="M20 12l-4 4" />
							<path d="M20 12l-4 -4" />
							<path d="M4 4l0 16" />
						</svg>
					{:else}
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M4 12l10 0" />
							<path d="M4 12l4 4" />
							<path d="M4 12l4 -4" />
							<path d="M20 4l0 16" />
						</svg>
					{/if}
				</button>
			</div>
			{#if !collapsed && branding.showCredit}
				<a href="https://trilby.media" target="_blank" rel="noopener"
					class="group mt-1 block text-[11px] leading-snug text-sidebar-foreground/50 transition-colors hover:text-sidebar-foreground/80"
					title={i18n.t('ADMIN_NEXT.APP_SHELL.MADE_BY_PLAIN')}
					aria-label={i18n.t('ADMIN_NEXT.APP_SHELL.MADE_BY_PLAIN')}>
					{#each credit as part, i (i)}
						{#if part.slot === 'code'}
							<CodeXml size={12} strokeWidth={2.25} class="inline-block -mt-px align-middle" aria-hidden="true" />
						{:else if part.slot === 'love'}
							<Heart size={11} class="inline-block -mt-px align-middle fill-current text-rose-500/70 transition-colors group-hover:text-rose-500" aria-hidden="true" />
						{:else if part.slot === 'company'}
							<span class="font-medium text-sidebar-foreground/70 group-hover:text-primary group-hover:underline">Trilby Media</span>
						{:else}
							{part.text}
						{/if}
					{/each}
				</a>
			{/if}
		</div>
	</aside>

	<!-- Main -->
	<div class="flex min-w-0 flex-1 flex-col overflow-hidden">
		<header class="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-background px-4">
			<button class="text-muted-foreground lg:hidden" onclick={() => mobileOpen = !mobileOpen} aria-label={i18n.t('ADMIN_NEXT.TOGGLE_MENU')}>
				<Menu size={18} />
			</button>

			<EnvironmentSwitcher />

			<!-- Page-editor presence (collab avatars + sync status). Only set
				 by the page edit route while the doc is connected. -->
			{#if pageEditorBar.presence}
				{@const p = pageEditorBar.presence}
				<div class="flex items-center gap-2 border-s border-border ps-3">
					<PresenceAvatars peers={p.peers} clientId={p.clientId} />
					<SyncStatusBadge
						status={p.status}
						detail={p.detail}
						peerCount={p.peers.filter((peer) => peer.clientId !== p.clientId).length}
					/>
				</div>
			{/if}

			<!-- Plugin toolbar — start zone. The open space on the left, kept well
				 clear of the destructive Clear Cache action (admin2#81). -->
			{#if startMenubarItems.length > 0}
				<div class="flex items-center gap-1 border-s border-border ps-3">
					<PluginMenubarItems placement="start" />
				</div>
			{/if}

			<div class="flex-1"></div>

			<!-- Page-editor Normal/Expert toggle. Only set on page edit route. -->
			{#if pageEditorBar.modeToggle}
				{@const mt = pageEditorBar.modeToggle}
				<div class="inline-flex rounded-md border border-border shadow-sm">
					<button
						class="inline-flex h-7 items-center gap-1.5 rounded-l-md px-2 text-[0.75rem] font-medium transition-colors sm:px-2.5
							{prefs.editorMode === 'normal'
								? 'bg-accent text-accent-foreground'
								: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}"
						title={i18n.t('ADMIN_NEXT.NORMAL_MODE')}
						aria-label={i18n.t('ADMIN_NEXT.NORMAL_MODE')}
						onclick={mt.onNormal}
					>
						<FileText size={13} />
						<span class="hidden sm:inline">{i18n.t('ADMIN_NEXT.PAGES.MODE_NORMAL')}</span>
					</button>
					<button
						class="inline-flex h-7 items-center gap-1.5 rounded-r-md px-2 text-[0.75rem] font-medium transition-colors sm:px-2.5
							{prefs.editorMode === 'expert'
								? 'bg-accent text-accent-foreground'
								: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}"
						title={i18n.t('ADMIN_NEXT.EXPERT_MODE')}
						aria-label={i18n.t('ADMIN_NEXT.EXPERT_MODE')}
						onclick={mt.onExpert}
					>
						<Code size={13} />
						<span class="hidden sm:inline">{i18n.t('ADMIN_NEXT.PAGES.MODE_EXPERT')}</span>
					</button>
				</div>
			{/if}

			<!-- Menubar -->
			<div class="flex items-center gap-1">
				<!-- Custom group: plugin buttons that opted into the end zone, plus
					 the user's own quick links. A divider sets them apart from the
					 core actions so it's clear which buttons are system controls. -->
				<PluginMenubarItems placement="end" />
				<MenubarLinks />
				{#if hasEndCustom}
					<div class="mx-1 h-5 w-px bg-border"></div>
				{/if}
				<!-- Core actions — fixed, never plugin-movable. -->
				<ViewSiteButton />
				<CacheClearButton />
			</div>

			<div class="h-5 w-px bg-border"></div>

			<!-- Color mode toggle -->
			<button class="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
				onclick={() => theme.toggleColorMode()} aria-label={i18n.t('ADMIN_NEXT.TOGGLE_DARK_MODE')}>
				{#if theme.isDark}<Sun size={15} />{:else}<Moon size={15} />{/if}
			</button>
		</header>

		<DemoModeBanner />

		<main class="flex-1 overflow-x-hidden overflow-y-auto">
			<div class="h-full min-w-0">
				{@render children()}
			</div>
		</main>
	</div>

	<ContextPanelHost />
	<FloatingWidgetLoader />
	<DebugPanel />
	<ReauthModal />
</div>
