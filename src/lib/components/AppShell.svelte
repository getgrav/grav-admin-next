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
	import { api } from '$lib/api/client';
	import { invalidations } from '$lib/stores/invalidation.svelte';
	import { can } from '$lib/utils/permissions';
	import { resolveAvatarUrl } from '$lib/utils/avatar';
	import BrandLogo from '$lib/components/ui/BrandLogo.svelte';
	import EnvironmentSwitcher from '$lib/components/ui/EnvironmentSwitcher.svelte';
	import CacheClearButton from '$lib/components/menubar/CacheClearButton.svelte';
	import MenubarLinks from '$lib/components/menubar/MenubarLinks.svelte';
	import PluginMenubarItems from '$lib/components/menubar/PluginMenubarItems.svelte';
	import ViewSiteButton from '$lib/components/menubar/ViewSiteButton.svelte';
	import { sidebarStore } from '$lib/stores/sidebar.svelte';
	import { navBadges } from '$lib/stores/navBadges.svelte';
	import { floatingWidgetStore } from '$lib/stores/floatingWidgets.svelte';
	import FloatingWidgetLoader from '$lib/components/floating-widgets/FloatingWidgetLoader.svelte';
	import { contextPanelStore } from '$lib/stores/contextPanels.svelte';
	import ContextPanelHost from '$lib/components/context-panels/ContextPanelHost.svelte';
	import ReauthModal from '$lib/components/auth/ReauthModal.svelte';
	import { pageEditorBar } from '$lib/stores/pageEditorBar.svelte';
	import PresenceAvatars from '$lib/components/sync/PresenceAvatars.svelte';
	import SyncStatusBadge from '$lib/components/sync/SyncStatusBadge.svelte';
	import type { Snippet } from 'svelte';
	import {
		LayoutDashboard, FileText, Image, Users, Puzzle, Palette,
		Settings, Wrench, SlidersHorizontal,
		Sun, Moon, Menu, Code
	} from 'lucide-svelte';

	interface Props { children: Snippet; }
	let { children }: Props = $props();

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
			sidebarStore.load();
			floatingWidgetStore.load();
			contextPanelStore.load();
			navBadges.load();
		} else {
			sidebarStore.clear();
			floatingWidgetStore.clear();
			contextPanelStore.clear();
			navBadges.clear();
		}
	});

	// Refresh user profile and permissions on mount
	$effect(() => {
		if (auth.isAuthenticated && auth.username) {
			refreshMe();
		}
	});

	// Refresh sidebar version labels when admin/grav itself is updated
	$effect(() => {
		if (!auth.isAuthenticated) return;
		const unsubs = [
			invalidations.subscribe('plugins:update:admin', () => refreshMe()),
			invalidations.subscribe('plugins:update:admin2', () => refreshMe()),
			invalidations.subscribe('plugins:update:api', () => refreshMe()),
		];
		return () => { for (const u of unsubs) u(); };
	});

	let collapsed = $state(false);
	let mobileOpen = $state(false);

	const navItems: { href: string; label: string; icon: typeof LayoutDashboard; badgeKey?: string; permission?: string }[] = [
		{ href: `${base}/`, label: 'Dashboard', icon: LayoutDashboard },
		{ href: `${base}/config`, label: 'Configuration', icon: Settings, permission: 'api.config.read' },
		{ href: `${base}/users`, label: 'Users', icon: Users, badgeKey: 'users', permission: 'api.users.read' },
		{ href: `${base}/pages`, label: 'Pages', icon: FileText, badgeKey: 'pages', permission: 'api.pages.read' },
		{ href: `${base}/media`, label: 'Media', icon: Image, badgeKey: 'media', permission: 'api.media.read' },
		{ href: `${base}/plugins`, label: 'Plugins', icon: Puzzle, badgeKey: 'plugins', permission: 'api.gpm.read' },
		{ href: `${base}/themes`, label: 'Themes', icon: Palette, badgeKey: 'themes', permission: 'api.gpm.read' },
		{ href: `${base}/tools`, label: 'Tools', icon: Wrench, permission: 'api.system.read' },
	];

	const visibleNavItems = $derived(
		navItems.filter(item => !item.permission || can(item.permission))
	);

	const visiblePluginItems = $derived(
		sidebarStore.items
	);

	const settingsItem = { href: `${base}/settings`, label: 'Settings', icon: SlidersHorizontal };

	function isActive(href: string): boolean {
		if (href === `${base}/`) return page.url.pathname === `${base}/`;
		return page.url.pathname.startsWith(href);
	}

	async function handleLogout() {
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

	<!-- Sidebar -->
	<aside class="fixed z-40 flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-200 lg:relative lg:z-auto
		{collapsed ? 'w-[52px]' : 'w-56'}
		{mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}">

		<div class="flex h-12 items-center border-b border-sidebar-border px-3">
			<BrandLogo size="sidebar" showLabel={!collapsed} />
		</div>

		<nav class="flex-1 overflow-y-auto px-2 py-2">
			<ul class="space-y-0.5">
				{#each visibleNavItems as item}
					<li>
						<a href={item.href}
							class="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors
								{isActive(item.href)
									? 'bg-primary/10 text-primary'
									: 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}"
							onclick={() => mobileOpen = false}
							title={collapsed ? item.label : undefined}>
							<item.icon size={16} strokeWidth={isActive(item.href) ? 2 : 1.5} />
							{#if !collapsed}
								<span>{item.label}</span>
								{#if item.badgeKey && navBadges.counts[item.badgeKey] != null}
									<span class="ml-auto rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{navBadges.counts[item.badgeKey]}</span>
								{/if}
							{/if}
						</a>
					</li>
				{/each}
				{#if visiblePluginItems.length > 0}
					<li class="my-1 border-t border-sidebar-border"></li>
					{#each visiblePluginItems as item (item.id)}
						<li>
							<a href="{base}{item.route}"
								class="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors
									{isActive(`${base}${item.route}`)
										? 'bg-primary/10 text-primary'
										: 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}"
								onclick={() => mobileOpen = false}
								title={collapsed ? item.label : undefined}>
								<i class="fa-solid {item.icon.startsWith('fa-') ? item.icon : 'fa-' + item.icon} w-4 text-center text-[13px]"></i>
								{#if !collapsed}
									<span>{item.label}</span>
									{#if item.badge != null}
										<span class="ml-auto rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{item.badge}</span>
									{/if}
								{/if}
							</a>
						</li>
					{/each}
				{/if}
			</ul>
		</nav>

		<!-- Settings link -->
		<div class="border-t border-sidebar-border px-2 pt-2">
			<a href={settingsItem.href}
				class="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors
					{isActive(settingsItem.href)
						? 'bg-primary/10 text-primary'
						: 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}"
				onclick={() => mobileOpen = false}
				title={collapsed ? settingsItem.label : undefined}>
				<settingsItem.icon size={16} strokeWidth={isActive(settingsItem.href) ? 2 : 1.5} />
				{#if !collapsed}<span>{settingsItem.label}</span>{/if}
			</a>
		</div>

		<!-- User profile -->
		<div class="border-t border-sidebar-border px-2 py-2">
			{#if collapsed}
				<a href="{base}/users/{auth.username}" class="flex items-center justify-center rounded-md p-1.5 transition-colors hover:bg-sidebar-accent" title={auth.fullname || auth.username}>
					<img
						src={avatarSrc}
						alt={auth.fullname || auth.username}
						class="h-7 w-7 rounded-full object-cover"
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
						<a href="{base}/users/{auth.username}" class="block truncate text-[13px] font-medium text-foreground hover:underline">
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

		<!-- Versions + Collapse toggle -->
		<div class="flex items-center gap-2 border-t border-sidebar-border px-4 py-1.5">
			{#if !collapsed && (auth.gravVersion || auth.adminVersion)}
				<div class="flex-1 text-xs leading-tight">
					{#if auth.gravVersion}<div class="text-sidebar-foreground/60">{i18n.t('ADMIN_NEXT.APP_SHELL.GRAV_VERSION', { version: auth.gravVersion })}</div>{/if}
					{#if auth.adminVersion}<div class="text-sidebar-foreground/50">{i18n.t('ADMIN_NEXT.APP_SHELL.ADMIN_VERSION', { version: auth.adminVersion })}</div>{/if}
				</div>
			{/if}
			<button
				class="ml-auto hidden h-7 w-7 shrink-0 items-center justify-center rounded-md p-1.5 text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground lg:flex {collapsed ? 'mx-auto' : ''}"
				onclick={() => collapsed = !collapsed}
				aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
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
				<div class="flex items-center gap-2 border-l border-border pl-3">
					<PresenceAvatars peers={p.peers} clientId={p.clientId} />
					<SyncStatusBadge
						status={p.status}
						detail={p.detail}
						peerCount={p.peers.filter((peer) => peer.clientId !== p.clientId).length}
					/>
				</div>
			{/if}

			<div class="flex-1"></div>

			<!-- Page-editor Normal/Expert toggle. Only set on page edit route. -->
			{#if pageEditorBar.modeToggle}
				{@const mt = pageEditorBar.modeToggle}
				<div class="inline-flex rounded-md border border-border shadow-sm">
					<button
						class="inline-flex h-7 items-center gap-1.5 rounded-l-md px-2 text-[12px] font-medium transition-colors sm:px-2.5
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
						class="inline-flex h-7 items-center gap-1.5 rounded-r-md px-2 text-[12px] font-medium transition-colors sm:px-2.5
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
				<ViewSiteButton />
				<PluginMenubarItems />
				<MenubarLinks />
				<CacheClearButton />
			</div>

			<div class="h-5 w-px bg-border"></div>

			<!-- Color mode toggle -->
			<button class="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
				onclick={() => theme.toggleColorMode()} aria-label={i18n.t('ADMIN_NEXT.TOGGLE_DARK_MODE')}>
				{#if theme.isDark}<Sun size={15} />{:else}<Moon size={15} />{/if}
			</button>
		</header>

		<main class="flex-1 overflow-x-hidden overflow-y-auto">
			<div class="h-full min-w-0">
				{@render children()}
			</div>
		</main>
	</div>

	<ContextPanelHost />
	<FloatingWidgetLoader />
	<ReauthModal />
</div>
