<script lang="ts">
	import { DropdownMenu } from 'bits-ui';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import { prefs } from '$lib/stores/preferences.svelte';
	import { theme } from '$lib/stores/theme.svelte';
	import { menubar } from '$lib/stores/menubar.svelte';
	import { faIconClass } from '$lib/utils/fa-icon';
	import type { MenubarItem } from '$lib/api/endpoints/menubar';
	import { CACHE_SCOPES, clearCacheScope } from './CacheClearButton.svelte';
	import { Ellipsis, Globe, ExternalLink, RefreshCcwDot, Loader2, Sun, Moon } from 'lucide-svelte';

	// The phone version of the top bar's actions (below `md`): plugin buttons,
	// the user's quick links, View site, Clear cache and the colour mode toggle,
	// as rows of one menu. Each row does exactly what its toolbar button does.

	const pluginItems = $derived([...menubar.forPlacement('start'), ...menubar.forPlacement('end')]);
	const quickLinks = $derived(prefs.menubarLinks.filter((link) => link.url));
	const siteUrl = $derived(auth.serverUrl || '/');

	let open = $state(false);

	// A row's action runs once the menu has closed and focus is back on the
	// trigger, so a confirm prompt or plugin modal it opens takes the focus
	// cleanly and hands it back to the trigger when it closes.
	let pending: (() => void) | null = null;
	function later(fn: () => void) {
		pending = fn;
	}
	function onOpenChangeComplete(isOpen: boolean) {
		if (isOpen || !pending) return;
		const fn = pending;
		pending = null;
		fn();
	}

	const ROW = 'flex w-full cursor-default select-none items-center gap-2.5 rounded-md px-2.5 py-1.5 text-start text-sm text-popover-foreground outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:opacity-50';
	const ICON = 'flex w-4 shrink-0 items-center justify-center text-muted-foreground';

	function iconTint(item: MenubarItem): string {
		return item.variant === 'danger' ? 'text-destructive' : '';
	}
</script>

<DropdownMenu.Root bind:open {onOpenChangeComplete} dir={i18n.dir}>
	<DropdownMenu.Trigger
		class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground"
		aria-label={i18n.t('ADMIN_NEXT.APP_SHELL.MORE_ACTIONS')}
		title={i18n.t('ADMIN_NEXT.APP_SHELL.MORE_ACTIONS')}
	>
		<Ellipsis size={16} />
	</DropdownMenu.Trigger>

	<DropdownMenu.Portal>
		<DropdownMenu.Content
			align="end"
			sideOffset={6}
			collisionPadding={8}
			class="z-50 max-h-[var(--bits-dropdown-menu-content-available-height)] w-max min-w-52 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg outline-none"
		>
			{#if pluginItems.length > 0 || quickLinks.length > 0}
				{#each pluginItems as item (item.id)}
					{#if item.href}
						<DropdownMenu.Item class={ROW} textValue={item.label}>
							{#snippet child({ props })}
								<a {...props} href={item.href} target={item.target || undefined} rel={item.target === '_blank' ? 'noopener' : undefined}>
									<span class="{ICON} {iconTint(item)}"><i class="{item.icon ? faIconClass(item.icon) : 'fa-solid fa-circle-dot'} text-sm"></i></span>
									<span class="min-w-0 flex-1 truncate">{item.label}</span>
								</a>
							{/snippet}
						</DropdownMenu.Item>
					{:else}
						<DropdownMenu.Item
							class={ROW}
							textValue={item.label}
							disabled={menubar.executing === item.id}
							onSelect={() => later(() => menubar.run(item))}
						>
							<span class="{ICON} {iconTint(item)}">
								{#if menubar.executing === item.id}
									<Loader2 size={14} class="animate-spin" />
								{:else}
									<i class="{item.icon ? faIconClass(item.icon) : 'fa-solid fa-circle-dot'} text-sm"></i>
								{/if}
							</span>
							<span class="min-w-0 flex-1 truncate">{item.label}</span>
						</DropdownMenu.Item>
					{/if}
				{/each}
				{#each quickLinks as link, i (i)}
					<DropdownMenu.Item class={ROW} textValue={link.label}>
						{#snippet child({ props })}
							<a {...props} href={link.url} target={link.external ? '_blank' : undefined} rel={link.external ? 'noopener' : undefined}>
								<span class={ICON}><i class="{link.icon ? faIconClass(link.icon) : 'fa-solid fa-link'} text-sm"></i></span>
								<span class="min-w-0 flex-1 truncate">{link.label}</span>
							</a>
						{/snippet}
					</DropdownMenu.Item>
				{/each}
				<DropdownMenu.Separator class="-mx-1 my-1 h-px bg-border" />
			{/if}

			<DropdownMenu.Item class={ROW} textValue={i18n.t('ADMIN_NEXT.VIEW_SITE_BUTTON.VIEW_SITE')}>
				{#snippet child({ props })}
					<a {...props} href={siteUrl} target="_blank" rel="noopener noreferrer" title={i18n.t('ADMIN_NEXT.VIEW_SITE_BUTTON.OPEN_SITE_FRONTEND_IN_A_NEW_TAB')}>
						<span class={ICON}><Globe size={14} /></span>
						<span class="min-w-0 flex-1 truncate">{i18n.t('ADMIN_NEXT.VIEW_SITE_BUTTON.VIEW_SITE')}</span>
						<ExternalLink size={12} class="shrink-0 text-muted-foreground/60" />
					</a>
				{/snippet}
			</DropdownMenu.Item>

			<DropdownMenu.Group>
				<DropdownMenu.GroupHeading class="flex items-center gap-2.5 px-2.5 pb-1 pt-2 text-[0.625rem] font-medium uppercase tracking-wide text-muted-foreground/70">
					<span class={ICON}><RefreshCcwDot size={13} /></span>
					{i18n.t('ADMIN_NEXT.CACHE_CLEAR_BUTTON.CLEAR_CACHE')}
				</DropdownMenu.GroupHeading>
				{#each CACHE_SCOPES as scope (scope.value)}
					<DropdownMenu.Item class={ROW} onSelect={() => later(() => clearCacheScope(scope.value))}>
						<span class={ICON}></span>
						<span class="min-w-0 flex-1 truncate">{scope.label}</span>
					</DropdownMenu.Item>
				{/each}
			</DropdownMenu.Group>

			<DropdownMenu.Separator class="-mx-1 my-1 h-px bg-border" />

			<DropdownMenu.Item class={ROW} onSelect={() => later(() => theme.toggleColorMode())}>
				<span class={ICON}>{#if theme.isDark}<Sun size={14} />{:else}<Moon size={14} />{/if}</span>
				<span class="min-w-0 flex-1 truncate">{i18n.t('ADMIN_NEXT.TOGGLE_DARK_MODE')}</span>
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Portal>
</DropdownMenu.Root>
