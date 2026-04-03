<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { onDestroy } from 'svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import { prefs } from '$lib/stores/preferences.svelte';
	import { theme } from '$lib/stores/theme.svelte';
	import { logout } from '$lib/api/auth';
	import { api } from '$lib/api/client';
	import { resolveAvatarUrl } from '$lib/utils/avatar';
	import BrandLogo from '$lib/components/ui/BrandLogo.svelte';
	import { getUser } from '$lib/api/endpoints/users';
	import CacheClearButton from '$lib/components/menubar/CacheClearButton.svelte';
	import MenubarLinks from '$lib/components/menubar/MenubarLinks.svelte';
	import PluginMenubarItems from '$lib/components/menubar/PluginMenubarItems.svelte';
	import { sidebarStore } from '$lib/stores/sidebar.svelte';
	import type { Snippet } from 'svelte';
	import {
		LayoutDashboard, FileText, Image, Users, Puzzle, Palette,
		Settings, Wrench, SlidersHorizontal,
		Sun, Moon, LogOut, ChevronLeft, ChevronRight, Menu
	} from 'lucide-svelte';

	interface Props { children: Snippet; }
	let { children }: Props = $props();

	// Proactive token refresh: refresh the access token before it expires
	// so requests never hit a 401 from staleness.
	let refreshTimer: ReturnType<typeof setTimeout> | null = null;

	function scheduleTokenRefresh() {
		clearTokenRefresh();
		if (!auth.isAuthenticated || !auth.refreshToken) return;

		// Refresh at 80% of token lifetime (e.g. 15-min token → refresh at 12 min)
		const ttl = auth.expiresAt - Date.now();
		const delay = Math.max(10_000, ttl * 0.8); // at least 10s

		refreshTimer = setTimeout(async () => {
			try {
				const response = await fetch(`${auth.serverUrl}${auth.apiPrefix || '/api/v1'}/auth/refresh`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
					body: JSON.stringify({ refresh_token: auth.refreshToken }),
				});
				if (response.ok) {
					const body = await response.json();
					const data = body.data ?? body;
					auth.setTokens(data.access_token, data.refresh_token, data.expires_in);
					// Schedule the next refresh with the new token's TTL
					scheduleTokenRefresh();
				} else {
					// Refresh failed — token is no longer valid
					auth.logout();
				}
			} catch {
				// Network error — try again in 30s
				refreshTimer = setTimeout(() => scheduleTokenRefresh(), 30_000);
			}
		}, delay);
	}

	function clearTokenRefresh() {
		if (refreshTimer) {
			clearTimeout(refreshTimer);
			refreshTimer = null;
		}
	}

	$effect(() => {
		// Re-schedule when auth state changes (login, manual refresh, etc.)
		if (auth.isAuthenticated) {
			scheduleTokenRefresh();
		} else {
			clearTokenRefresh();
		}
	});

	onDestroy(clearTokenRefresh);

	// Load plugin sidebar items on authentication
	$effect(() => {
		if (auth.isAuthenticated) {
			sidebarStore.load();
		} else {
			sidebarStore.clear();
		}
	});

	// Refresh user profile on mount to keep avatar URL fresh
	$effect(() => {
		if (auth.isAuthenticated && auth.username) {
			getUser(auth.username).then(({ user }) => {
				auth.setUser(
					user.username,
					user.fullname || user.username,
					user.email || '',
					user.avatar_url || undefined,
				);
			}).catch(() => {});
		}
	});

	let collapsed = $state(false);
	let mobileOpen = $state(false);

	const navItems = [
		{ href: `${base}/`, label: 'Dashboard', icon: LayoutDashboard },
		{ href: `${base}/config`, label: 'Configuration', icon: Settings },
		{ href: `${base}/users`, label: 'Users', icon: Users },
		{ href: `${base}/pages`, label: 'Pages', icon: FileText },
		{ href: `${base}/media`, label: 'Media', icon: Image },
		{ href: `${base}/plugins`, label: 'Plugins', icon: Puzzle },
		{ href: `${base}/themes`, label: 'Themes', icon: Palette },
		{ href: `${base}/tools`, label: 'Tools', icon: Wrench },
	];

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
		<button class="fixed inset-0 z-30 bg-black/50 lg:hidden" onclick={() => mobileOpen = false} aria-label="Close menu"></button>
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
				{#each navItems as item}
					<li>
						<a href={item.href}
							class="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors
								{isActive(item.href)
									? 'bg-primary/10 text-primary'
									: 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}"
							onclick={() => mobileOpen = false}
							title={collapsed ? item.label : undefined}>
							<item.icon size={16} strokeWidth={isActive(item.href) ? 2 : 1.5} />
							{#if !collapsed}<span>{item.label}</span>{/if}
						</a>
					</li>
				{/each}
				{#if sidebarStore.items.length > 0}
					<li class="my-1 border-t border-sidebar-border"></li>
					{#each sidebarStore.items as item (item.id)}
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
						title="Sign out"
					>
						<LogOut size={14} />
					</button>
				</div>
			{/if}
		</div>

		<!-- Collapse toggle -->
		<div class="border-t border-sidebar-border px-2 py-1.5">
			<button
				class="hidden w-full items-center justify-center rounded-md p-1.5 text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground lg:flex"
				onclick={() => collapsed = !collapsed}
				aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
				{#if collapsed}<ChevronRight size={14} />{:else}<ChevronLeft size={14} />{/if}
			</button>
		</div>
	</aside>

	<!-- Main -->
	<div class="flex flex-1 flex-col overflow-hidden">
		<header class="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-background px-4">
			<button class="text-muted-foreground lg:hidden" onclick={() => mobileOpen = !mobileOpen} aria-label="Toggle menu">
				<Menu size={18} />
			</button>

			{#if auth.environment}
				<span class="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{auth.environment}</span>
			{/if}

			<div class="flex-1"></div>

			<!-- Menubar -->
			<div class="flex items-center gap-1">
				<PluginMenubarItems />
				<MenubarLinks />
				<CacheClearButton />
			</div>

			<div class="h-5 w-px bg-border"></div>

			<!-- Color mode toggle -->
			<button class="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
				onclick={() => theme.toggleColorMode()} aria-label="Toggle dark mode">
				{#if theme.isDark}<Sun size={15} />{:else}<Moon size={15} />{/if}
			</button>
		</header>

		<main class="flex-1 overflow-y-auto">
			<div class="mx-auto h-full max-w-6xl">
				{@render children()}
			</div>
		</main>
	</div>
</div>
