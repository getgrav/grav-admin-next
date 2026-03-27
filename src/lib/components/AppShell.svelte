<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/stores/auth.svelte';
	import { theme } from '$lib/stores/theme.svelte';
	import { logout } from '$lib/api/auth';
	import type { Snippet } from 'svelte';
	import {
		LayoutDashboard, FileText, Image, Users, Puzzle, Palette,
		Settings, Wrench, Monitor, Sun, Moon, LogOut,
		ChevronLeft, ChevronRight, Menu
	} from 'lucide-svelte';

	interface Props { children: Snippet; }
	let { children }: Props = $props();

	let collapsed = $state(false);
	let mobileOpen = $state(false);

	const navItems = [
		{ href: '/', label: 'Dashboard', icon: LayoutDashboard },
		{ href: '/pages', label: 'Pages', icon: FileText },
		{ href: '/media', label: 'Media', icon: Image },
		{ href: '/users', label: 'Users', icon: Users },
		{ href: '/plugins', label: 'Plugins', icon: Puzzle },
		{ href: '/themes', label: 'Themes', icon: Palette },
		{ href: '/config', label: 'Configuration', icon: Settings },
		{ href: '/tools', label: 'Tools', icon: Wrench },
		{ href: '/system', label: 'System', icon: Monitor }
	];

	function isActive(href: string): boolean {
		if (href === '/') return page.url.pathname === '/';
		return page.url.pathname.startsWith(href);
	}

	async function handleLogout() {
		await logout();
		goto('/login');
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

		<div class="flex h-12 items-center gap-2.5 border-b border-sidebar-border px-3">
			<div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
				<span class="text-xs font-bold">G</span>
			</div>
			{#if !collapsed}
				<span class="text-sm font-semibold tracking-tight text-foreground">Grav</span>
			{/if}
		</div>

		<nav class="flex-1 overflow-y-auto px-2 py-2">
			<ul class="space-y-0.5">
				{#each navItems as item}
					<li>
						<a href={item.href}
							class="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors
								{isActive(item.href)
									? 'bg-sidebar-accent text-sidebar-accent-foreground'
									: 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}"
							onclick={() => mobileOpen = false}
							title={collapsed ? item.label : undefined}>
							<item.icon size={16} strokeWidth={isActive(item.href) ? 2 : 1.5} />
							{#if !collapsed}<span>{item.label}</span>{/if}
						</a>
					</li>
				{/each}
			</ul>
		</nav>

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
				<span class="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:border-blue-800/50 dark:bg-blue-500/10 dark:text-blue-300">{auth.environment}</span>
			{/if}

			<div class="flex-1"></div>

			<button class="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
				onclick={() => theme.toggleColorMode()} aria-label="Toggle dark mode">
				{#if theme.isDark}<Sun size={15} />{:else}<Moon size={15} />{/if}
			</button>

			<div class="h-5 w-px bg-border"></div>

			<div class="flex items-center gap-2">
				<span class="text-[13px] font-medium text-foreground">{auth.fullname || auth.username}</span>
				<button class="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
					onclick={handleLogout} title="Sign out">
					<LogOut size={15} />
				</button>
			</div>
		</header>

		<main class="flex-1 overflow-y-auto p-5">
			{@render children()}
		</main>
	</div>
</div>
