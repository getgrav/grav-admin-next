<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import { getInstalledPlugins, setPluginEnabled, checkUpdates, updatePackage, updateAllPackages, removePlugin, getPluginChangelog, type PluginInfo } from '$lib/api/endpoints/gpm';
	import { reloadIfAdminUpdated } from '$lib/utils/gpm';
	import { invalidations } from '$lib/stores/invalidation.svelte';
	import { dialogs } from '$lib/stores/dialogs.svelte';
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import StickyHeader from '$lib/components/ui/StickyHeader.svelte';
	import AddPluginModal from '$lib/components/AddPluginModal.svelte';
	import GravUpdateBanner from '$lib/components/GravUpdateBanner.svelte';
	import { toast } from 'svelte-sonner';
	import { Search, Puzzle, ExternalLink, ArrowUpCircle, Loader2, Plus, RefreshCw, BadgeCheck, CornerDownRight, LayoutGrid, Table as TableIcon, Trash2, FileText, Book, Bug } from 'lucide-svelte';
	import { hostname } from '$lib/utils/url';
	import DirectionalIcon from '$lib/components/ui/DirectionalIcon.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { faIconClass, parseKeywords, parseDependencies, parseCompatibility, isFirstParty, descriptionText, formatChangelog } from '$lib/utils/gpm';
	import MarkdownModal from '$lib/components/ui/MarkdownModal.svelte';
	import { canWrite } from '$lib/utils/permissions';
	import { scopedKey } from '$lib/utils/scopedStorage';
	import { prefs } from '$lib/stores/preferences.svelte';
	import PluginsTableView from '$lib/components/plugins/PluginsTableView.svelte';

	const SELECTED_STORAGE_KEY = 'admin-next:plugins:selected-slug';

	function readStoredSlug(): string | null {
		if (typeof localStorage === 'undefined') return null;
		try {
			return localStorage.getItem(scopedKey(SELECTED_STORAGE_KEY));
		} catch {
			return null;
		}
	}

	function writeStoredSlug(slug: string | null): void {
		if (typeof localStorage === 'undefined') return;
		try {
			const key = scopedKey(SELECTED_STORAGE_KEY);
			if (slug) localStorage.setItem(key, slug);
			else localStorage.removeItem(key);
		} catch {
			/* quota or disabled — selection still works in-memory */
		}
	}

	const canWriteGpm = $derived(canWrite('gpm'));

	const translateLabel = i18n.tMaybe;

	let plugins = $state<PluginInfo[]>([]);
	let loading = $state(true);
	let search = $state('');
	let sortBy = $state<'name' | 'author' | 'enabled'>('name');
	let selectedSlug = $state<string | null>(null);
	let togglingSlug = $state<string | null>(null);
	let addModalOpen = $state(false);
	let installSlug = $state('');

	// Changelog modal
	let changelogOpen = $state(false);
	let changelogTitle = $state('');
	let changelogContent = $state('');
	let changelogLoading = $state(false);

	async function showChangelog(plugin: PluginInfo) {
		changelogLoading = true;
		changelogTitle = `${plugin.name} — ${i18n.t('ADMIN_NEXT.PLUGINS.CHANGELOG')}`;
		changelogContent = '';
		changelogOpen = true;
		try {
			changelogContent = formatChangelog(await getPluginChangelog(plugin.slug));
		} catch {
			changelogContent = '*Changelog not available.*';
		} finally {
			changelogLoading = false;
		}
	}

	// Auto-open install modal when navigating with ?install=slug (only if the
	// account can actually install — closes a URL-bypass of the gated Add button).
	$effect(() => {
		const slug = page.url.searchParams.get('install');
		if (slug && canWriteGpm) {
			installSlug = slug;
			addModalOpen = true;
		}
	});
	let checkingUpdates = $state(false);
	let updatingSlug = $state<string | null>(null);
	let updatingAll = $state(false);
	let removingSlug = $state<string | null>(null);

	const updatableCount = $derived(plugins.filter((p) => p.updatable).length);

	const filtered = $derived.by(() => {
		let list = [...plugins];

		// Search
		if (search) {
			const q = search.toLowerCase();
			list = list.filter(
				(p) =>
					p.name.toLowerCase().includes(q) ||
					p.slug.toLowerCase().includes(q) ||
					(p.description ?? '').toLowerCase().includes(q) ||
					(p.author?.name ?? '').toLowerCase().includes(q) ||
					parseKeywords(p.keywords).some((k) => k.toLowerCase().includes(q)),
			);
		}

		// Sort
		list.sort((a, b) => {
			switch (sortBy) {
				case 'author':
					return (a.author?.name ?? '').localeCompare(b.author?.name ?? '');
				case 'enabled':
					return (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0);
				default:
					return (a.name ?? a.slug).localeCompare(b.name ?? b.slug);
			}
		});

		return list;
	});

	const selectedPlugin = $derived(
		selectedSlug ? plugins.find((p) => p.slug === selectedSlug) ?? null : null,
	);

	async function loadPlugins() {
		loading = true;
		try {
			plugins = await getInstalledPlugins();
			if (!selectedSlug && plugins.length > 0) {
				const stored = readStoredSlug();
				const restored = stored && plugins.some((p) => p.slug === stored) ? stored : null;
				selectedSlug = restored ?? plugins[0].slug;
			}
		} catch (err) {
			toast.error(i18n.t('ADMIN_NEXT.PLUGINS.FAILED_TO_LOAD_PLUGINS'));
		} finally {
			loading = false;
		}
	}

	// Plugins that cannot be disabled from an API-based admin
	const PROTECTED_PLUGINS = new Set(['api', 'login']);

	async function toggleEnabled(plugin: PluginInfo, e: Event) {
		e.stopPropagation();
		if (plugin.enabled && PROTECTED_PLUGINS.has(plugin.slug)) {
			toast.error(i18n.t('ADMIN_NEXT.TOASTS.PLUGIN_LOCKOUT_BLOCK', { name: plugin.name }));
			return;
		}
		togglingSlug = plugin.slug;
		const newState = !plugin.enabled;
		try {
			await setPluginEnabled(plugin.slug, newState);
			plugin.enabled = newState;
			plugins = [...plugins]; // trigger reactivity
			toast.success(i18n.t(
				newState ? 'ADMIN_NEXT.TOASTS.PLUGIN_ENABLED' : 'ADMIN_NEXT.TOASTS.PLUGIN_DISABLED',
				{ name: plugin.name }
			));
		} catch (err: unknown) {
			const detail = err instanceof Error ? err.message : String(err);
			toast.error(i18n.t(
				newState ? 'ADMIN_NEXT.TOASTS.PLUGIN_ENABLE_FAILED' : 'ADMIN_NEXT.TOASTS.PLUGIN_DISABLE_FAILED',
				{ name: plugin.name, detail }
			));
		} finally {
			togglingSlug = null;
		}
	}

	// Below the lg breakpoint the detail panel is hidden, so a single tap
	// would otherwise do nothing visible. Navigate straight to config instead.
	const hasDetailPanel = () =>
		typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;

	function selectPlugin(slug: string) {
		if (!hasDetailPanel()) {
			openPluginConfig(slug);
			return;
		}
		selectedSlug = slug;
		writeStoredSlug(slug);
	}

	function openPluginConfig(slug: string) {
		goto(`${base}/plugins/${slug}`);
	}

	async function handleCheckUpdates() {
		checkingUpdates = true;
		try {
			const result = await checkUpdates(true);
			toast.success(i18n.t('ADMIN_NEXT.TOASTS.GPM_REFRESHED', { n: result.total }));
			await loadPlugins();
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.PLUGINS.FAILED_TO_CHECK_FOR_UPDATES'));
		} finally {
			checkingUpdates = false;
		}
	}

	async function handleUpdatePlugin(plugin: PluginInfo, e: Event) {
		e.stopPropagation();
		const ok = await dialogs.confirm({
			title: i18n.t('ADMIN_NEXT.PLUGINS.UPDATE_CONFIRM_TITLE'),
			message: i18n.t('ADMIN_NEXT.PLUGINS.UPDATE_CONFIRM_MESSAGE', {
				name: plugin.name,
				version: plugin.available_version,
			}),
			confirmLabel: i18n.t('ADMIN_NEXT.UPDATE_TO_VERSION', { version: plugin.available_version }),
		});
		if (!ok) return;
		updatingSlug = plugin.slug;
		try {
			const result = await updatePackage(plugin.slug);
			for (const depSlug of result.dependencies ?? []) {
				toast.success(i18n.t('ADMIN_NEXT.TOASTS.DEPENDENCY_INSTALLED', { slug: depSlug }));
			}
			toast.success(i18n.t('ADMIN_NEXT.TOASTS.PACKAGE_UPDATED', { name: plugin.name }));
			await loadPlugins();
			reloadIfAdminUpdated([plugin.slug, ...(result.dependencies ?? [])]);
		} catch (err: unknown) {
			const detail = err instanceof Error ? err.message : String(err);
			toast.error(i18n.t('ADMIN_NEXT.TOASTS.PACKAGE_UPDATE_FAILED', { name: plugin.name, detail }));
		} finally {
			updatingSlug = null;
		}
	}

	async function handleRemovePlugin(plugin: PluginInfo, e: Event) {
		e.stopPropagation();
		const ok = await dialogs.confirm({
			title: i18n.t('ADMIN_NEXT.PLUGINS.REMOVE_CONFIRM_TITLE'),
			message: i18n.t('ADMIN_NEXT.PLUGINS.REMOVE_CONFIRM_MESSAGE', { name: plugin.name }),
			confirmLabel: i18n.t('ADMIN_NEXT.DELETE'),
			variant: 'destructive',
		});
		if (!ok) return;
		removingSlug = plugin.slug;
		try {
			await removePlugin(plugin.slug);
			toast.success(i18n.t('ADMIN_NEXT.TOASTS.PLUGIN_REMOVED', { name: plugin.name }));
			if (selectedSlug === plugin.slug) {
				selectedSlug = null;
				writeStoredSlug(null);
			}
			await loadPlugins();
		} catch (err: unknown) {
			const detail = err instanceof Error ? err.message : String(err);
			toast.error(i18n.t('ADMIN_NEXT.TOASTS.PLUGIN_REMOVE_FAILED', { name: plugin.name, detail }));
		} finally {
			removingSlug = null;
		}
	}

	async function handleUpdateAll() {
		const updatable = plugins.filter((p) => p.updatable);
		const ok = await dialogs.confirm({
			title: i18n.t('ADMIN_NEXT.PLUGINS.UPDATE_ALL_CONFIRM_TITLE'),
			message: i18n.t('ADMIN_NEXT.PLUGINS.UPDATE_ALL_CONFIRM_MESSAGE', { n: updatable.length }),
			items: updatable.map((p) => `${p.name} → v${p.available_version}`),
			confirmLabel: i18n.t('ADMIN_NEXT.PLUGINS.UPDATE_ALL'),
		});
		if (!ok) return;
		updatingAll = true;
		try {
			const result = await updateAllPackages();
			const okCount = result.updated.length;
			const bad = result.failed.length;
			if (bad === 0) {
				toast.success(i18n.t('ADMIN_NEXT.TOASTS.PACKAGES_UPDATED', { n: okCount }));
			} else {
				const reasons = result.failed
					.map((f) => `${f.package}: ${f.error}`)
					.join('\n');
				toast.error(
					(okCount > 0
						? i18n.t('ADMIN_NEXT.TOASTS.PACKAGES_UPDATED', { n: okCount }) + ' · '
						: '') + `${reasons}`,
				);
			}
			await loadPlugins();
			reloadIfAdminUpdated([...result.updated, ...result.cascaded_dependencies]);
		} catch (err: unknown) {
			const detail = err instanceof Error ? err.message : String(err);
			toast.error(i18n.t('ADMIN_NEXT.TOASTS.UPDATE_FAILED', { detail }));
		} finally {
			updatingAll = false;
		}
	}

	function handlePluginInstalled() {
		loadPlugins();
	}

	$effect(() => {
		loadPlugins();
	});

	// Refetch when plugins change elsewhere (install, uninstall, update, enable/disable)
	// or on tab refocus. Config updates on plugins/<slug> also emit plugins:update,
	// so no separate config subscription is needed.
	onMount(() => {
		const unsubPlugins = invalidations.subscribe('plugins:*', () => loadPlugins());
		const unsubFocus = invalidations.subscribe('*:focus', () => loadPlugins());
		return () => { unsubPlugins(); unsubFocus(); };
	});
</script>

<svelte:head>
	<title>{i18n.t('ADMIN_NEXT.PLUGINS.PLUGINS_GRAV_ADMIN')}</title>
</svelte:head>

<div class="flex h-full flex-col">
	<!-- Header -->
	<StickyHeader noBorder>
		{#snippet children({ scrolled })}
			<div class="px-6 transition-[padding] duration-200 {scrolled ? 'py-2' : 'pt-6 pb-3'}">
				<div class="flex items-center justify-between {scrolled ? 'min-h-6' : 'min-h-8'}">
					<div>
						<h1 class="font-semibold tracking-tight text-foreground transition-[font-size] duration-200 {scrolled ? 'text-sm' : 'text-xl'}">{i18n.t('ADMIN_NEXT.NAV.PLUGINS')}</h1>
						{#if !scrolled && !loading}
							<p class="mt-0.5 text-xs text-muted-foreground">{plugins.length} installed</p>
						{/if}
					</div>
					{#if canWriteGpm}
					<div class="flex items-center gap-2">
						<Button variant="outline" size="sm" onclick={handleCheckUpdates} disabled={checkingUpdates || updatingAll}>
							<RefreshCw size={13} class={checkingUpdates ? 'animate-spin' : ''} />
							{i18n.t('ADMIN_NEXT.PLUGINS.CHECK_UPDATES')}
						</Button>
						{#if updatableCount > 0}
							<Button variant="outline" size="sm" onclick={handleUpdateAll} disabled={updatingAll}>
								{#if updatingAll}
									<Loader2 size={13} class="animate-spin" />
								{:else}
									<ArrowUpCircle size={13} />
								{/if}
								Update All ({updatableCount})
							</Button>
						{/if}
						<Button size="sm" onclick={() => (addModalOpen = true)}>
							<Plus size={14} />
							Add
						</Button>
					</div>
					{/if}
				</div>
			</div>
		{/snippet}
	</StickyHeader>

	<GravUpdateBanner onUpgraded={loadPlugins} />

	{#if loading}
		<div class="flex flex-1 items-center justify-center">
			<Loader2 size={24} class="animate-spin text-muted-foreground" />
		</div>
	{:else}
		<!-- Toolbar -->
		<div class="flex items-center gap-3 border-b border-border px-4 py-2">
			<div class="relative flex-1">
				<Search size={14} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
				<input
					type="text"
					class="h-8 w-full rounded-md border border-input bg-muted/50 ps-9 pe-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
					placeholder={i18n.t('ADMIN_NEXT.PLUGINS.SEARCH_PLUGINS')}
					bind:value={search}
				/>
			</div>
			<select
				class="h-8 rounded-md border border-input bg-muted/50 px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
				bind:value={sortBy}
				disabled={prefs.pluginsViewMode === 'table'}
			>
				<option value="name">Name</option>
				<option value="author">{i18n.t('ADMIN_NEXT.AUTHOR')}</option>
				<option value="enabled">{i18n.t('ADMIN_NEXT.PAGES.HEADER_STATUS')}</option>
			</select>
			<div class="inline-flex rounded-md border border-border shadow-sm">
				<button
					class="inline-flex h-8 items-center gap-1.5 px-3 text-[0.75rem] font-medium transition-colors first:rounded-l-md last:rounded-r-md
						{prefs.pluginsViewMode === 'cards'
							? 'bg-accent text-accent-foreground'
							: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}"
					onclick={() => prefs.pluginsViewMode = 'cards'}
					title={i18n.t('ADMIN_NEXT.USERS_TABLE.CARDS')}
				>
					<LayoutGrid size={14} />
					<span class="hidden sm:inline">{i18n.t('ADMIN_NEXT.USERS_TABLE.CARDS')}</span>
				</button>
				<button
					class="inline-flex h-8 items-center gap-1.5 px-3 text-[0.75rem] font-medium transition-colors first:rounded-l-md last:rounded-r-md
						{prefs.pluginsViewMode === 'table'
							? 'bg-accent text-accent-foreground'
							: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}"
					onclick={() => prefs.pluginsViewMode = 'table'}
					title={i18n.t('ADMIN_NEXT.USERS_TABLE.TABLE')}
				>
					<TableIcon size={14} />
					<span class="hidden sm:inline">{i18n.t('ADMIN_NEXT.USERS_TABLE.TABLE')}</span>
				</button>
			</div>
		</div>

		{#if prefs.pluginsViewMode === 'table'}
			<div class="flex-1 overflow-y-auto">
				<PluginsTableView
					plugins={filtered}
					canEdit={canWriteGpm}
					{togglingSlug}
					{updatingSlug}
					{updatingAll}
					{removingSlug}
					protectedSlugs={PROTECTED_PLUGINS}
					onConfigure={openPluginConfig}
					onToggle={toggleEnabled}
					onUpdate={handleUpdatePlugin}
					onChangelog={showChangelog}
					onRemove={handleRemovePlugin}
				/>
			</div>
		{:else}
		<!-- Main content: list + detail panel -->
		<div class="flex flex-1 overflow-hidden">
			<!-- Plugin list -->
			<div class="w-full overflow-y-auto border-e border-border lg:w-[400px] xl:w-[440px]">
				{#each filtered as plugin (plugin.slug)}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->					<div
						class="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-start transition-colors
							{selectedSlug === plugin.slug ? 'bg-accent' : 'hover:bg-muted/50'}"
						onclick={() => selectPlugin(plugin.slug)}
						ondblclick={() => openPluginConfig(plugin.slug)}
					>
						<!-- Icon -->
						<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg {plugin.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}">
							{#if plugin.icon}
								<i class="{faIconClass(plugin.icon)} text-sm"></i>
							{:else}
								<Puzzle size={16} />
							{/if}
						</div>

						<!-- Info -->
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-1.5">
								<span class="truncate text-sm font-medium text-foreground">{plugin.name}</span>
								{#if isFirstParty(plugin.author)}
									<BadgeCheck size={14} class="shrink-0 text-purple-500" />
								{/if}
								{#if plugin.premium}
									<span class="shrink-0 rounded-full bg-red-500/15 px-1.5 py-0.5 text-[0.625rem] font-medium text-red-600 dark:text-red-400">{i18n.t('ADMIN_NEXT.PREMIUM')}</span>
								{/if}
								{#if plugin.updatable}
									<ArrowUpCircle size={12} class="shrink-0 text-amber-500" />
								{/if}
							</div>
							<p class="truncate text-xs text-muted-foreground">{descriptionText(plugin)}</p>
						</div>

						<!-- Symlink indicator -->
						{#if plugin.is_symlink}
							<span class="inline-flex shrink-0" title={i18n.t('ADMIN_NEXT.PLUGINS.SYMLINKED')}><CornerDownRight size={14} class="text-muted-foreground/60" aria-label={i18n.t('ADMIN_NEXT.PLUGINS.SYMLINKED')} /></span>
						{/if}

						<!-- Enable toggle -->
						<button
							type="button"
							class="shrink-0 rounded-full px-2.5 py-0.5 text-[0.625rem] font-medium transition-colors
								{plugin.enabled
									? 'bg-green-500/15 text-green-600 hover:bg-green-500/25 dark:text-green-400'
									: 'bg-muted text-muted-foreground hover:bg-muted/80'}"
							onclick={(e) => toggleEnabled(plugin, e)}
							disabled={togglingSlug === plugin.slug || !canWriteGpm}
						>
							{#if togglingSlug === plugin.slug}
								<Loader2 size={10} class="inline animate-spin" />
							{:else}
								{plugin.enabled ? 'Enabled' : 'Disabled'}
							{/if}
						</button>

						{#if canWriteGpm}
							<button
								type="button"
								class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
								aria-label={i18n.t('ADMIN_NEXT.DELETE')}
								title={i18n.t('ADMIN_NEXT.DELETE')}
								onclick={(e) => handleRemovePlugin(plugin, e)}
								disabled={removingSlug === plugin.slug}
							>
								{#if removingSlug === plugin.slug}
									<Loader2 size={12} class="animate-spin" />
								{:else}
									<Trash2 size={12} />
								{/if}
							</button>
						{/if}
					</div>
				{/each}

				{#if filtered.length === 0}
					<div class="px-4 py-8 text-center text-sm text-muted-foreground">
						{search ? 'No plugins match your search' : 'No plugins installed'}
					</div>
				{/if}
			</div>

			<!-- Detail panel -->
			<div class="hidden flex-1 overflow-y-auto lg:block">
				{#if selectedPlugin}
					<div class="p-6">
						<!-- Plugin header -->
						<div class="flex items-start gap-4">
							<div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl {selectedPlugin.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}">
								{#if selectedPlugin.icon}
									<i class="{faIconClass(selectedPlugin.icon)} text-2xl"></i>
								{:else}
									<Puzzle size={28} />
								{/if}
							</div>
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-1.5">
									<h2 class="text-lg font-semibold text-foreground">{selectedPlugin.name}</h2>
									{#if isFirstParty(selectedPlugin.author)}
										<BadgeCheck size={18} class="shrink-0 text-purple-500" />
									{/if}
									{#if selectedPlugin.is_symlink}
										<span class="inline-flex shrink-0" title={i18n.t('ADMIN_NEXT.PLUGINS.SYMLINKED')}><CornerDownRight size={14} class="text-muted-foreground/60" aria-label={i18n.t('ADMIN_NEXT.PLUGINS.SYMLINKED')} /></span>
									{/if}
									{#if selectedPlugin.premium}
										<span class="shrink-0 rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">{i18n.t('ADMIN_NEXT.PREMIUM')}</span>
									{/if}
								</div>
								<div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
									<span>v{selectedPlugin.version}</span>
									{#if selectedPlugin.author?.name}
										<span>by {selectedPlugin.author.name}</span>
									{/if}
									{#if selectedPlugin.updatable}
										<span class="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-600 dark:text-amber-400">
											{i18n.t('ADMIN_NEXT.UPDATE_AVAILABLE_VERSION', { version: selectedPlugin.available_version })}
										</span>
									{/if}
								</div>
							</div>
							<div class="flex items-center gap-2">
								{#if selectedPlugin.updatable && canWriteGpm}
									<Button
										variant="outline"
										size="sm"
										onclick={(e: Event) => handleUpdatePlugin(selectedPlugin, e)}
										disabled={updatingSlug === selectedPlugin.slug || updatingAll}
									>
										{#if updatingSlug === selectedPlugin.slug}
											<Loader2 size={14} class="me-1.5 animate-spin" />
										{:else}
											<ArrowUpCircle size={14} class="me-1.5" />
										{/if}
										{i18n.t('ADMIN_NEXT.UPDATE_TO_VERSION', { version: selectedPlugin.available_version })}
									</Button>
								{/if}
								{#if canWriteGpm}
									<button
										type="button"
										class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
										aria-label={i18n.t('ADMIN_NEXT.DELETE')}
										title={i18n.t('ADMIN_NEXT.DELETE')}
										onclick={(e: Event) => handleRemovePlugin(selectedPlugin, e)}
										disabled={removingSlug === selectedPlugin.slug}
									>
										{#if removingSlug === selectedPlugin.slug}
											<Loader2 size={14} class="animate-spin" />
										{:else}
											<Trash2 size={14} />
										{/if}
									</button>
								{/if}
								<button
									type="button"
									class="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
									onclick={() => openPluginConfig(selectedPlugin.slug)}
								>
									{i18n.t('ADMIN_NEXT.PLUGINS.CONFIGURE')}
									<DirectionalIcon name="chevron-forward" size={14} />
								</button>
							</div>
						</div>

						<!-- Description -->
						{#if selectedPlugin.description}
							{#if selectedPlugin.description_html}
								<div class="prose prose-sm dark:prose-invert mt-4 max-w-none text-sm leading-relaxed text-muted-foreground [&_a]:text-primary [&_a]:no-underline hover:[&_a]:underline [&_p]:my-0 [&_p+p]:mt-2">
									{@html selectedPlugin.description_html}
								</div>
							{:else}
								<p class="mt-4 text-sm leading-relaxed text-muted-foreground">
									{selectedPlugin.description}
								</p>
							{/if}
						{/if}

						<!-- Links -->
						<div class="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
							<button type="button" class="inline-flex items-center gap-1 hover:text-foreground" onclick={() => selectedPlugin && showChangelog(selectedPlugin)}>
								<FileText size={12} /> {i18n.t('ADMIN_NEXT.PLUGINS.CHANGELOG')}
							</button>
							{#if selectedPlugin.docs}
								<a href={selectedPlugin.docs} target="_blank" rel="noopener" class="inline-flex items-center gap-1 hover:text-foreground">
									<Book size={12} /> {i18n.t('ADMIN_NEXT.DOCUMENTATION')} <ExternalLink size={10} />
								</a>
							{/if}
							{#if selectedPlugin.bugs}
								<a href={selectedPlugin.bugs} target="_blank" rel="noopener" class="inline-flex items-center gap-1 hover:text-foreground">
									<Bug size={12} /> {i18n.t('ADMIN_NEXT.REPORT_ISSUE')} <ExternalLink size={10} />
								</a>
							{/if}
						</div>

						<!-- Metadata grid -->
						<div class="mt-6 grid grid-cols-2 gap-4">
							{#if selectedPlugin.author?.name}
								<div>
									<dt class="text-xs font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.AUTHOR')}</dt>
									<dd class="mt-0.5 text-sm text-foreground">
										{#if selectedPlugin.author.url}
											<a href={selectedPlugin.author.url} target="_blank" rel="noopener" class="text-primary hover:underline">
												{selectedPlugin.author.name}
												<ExternalLink size={10} class="inline" />
											</a>
										{:else}
											{selectedPlugin.author.name}
										{/if}
									</dd>
								</div>
							{/if}

							{#if selectedPlugin.homepage}
								<div>
									<dt class="text-xs font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.HOMEPAGE')}</dt>
									<dd class="mt-0.5 text-sm">
										<a href={selectedPlugin.homepage} target="_blank" rel="noopener" class="text-primary hover:underline">
											{hostname(selectedPlugin.homepage)}
											<ExternalLink size={10} class="inline" />
										</a>
									</dd>
								</div>
							{/if}

							<div>
								<dt class="text-xs font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.PAGES.HEADER_STATUS')}</dt>
								<dd class="mt-0.5 text-sm">
									<span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
										{selectedPlugin.enabled
											? 'bg-green-500/15 text-green-600 dark:text-green-400'
											: 'bg-muted text-muted-foreground'}">
										{selectedPlugin.enabled ? 'Enabled' : 'Disabled'}
									</span>
								</dd>
							</div>

							<div>
								<dt class="text-xs font-medium text-muted-foreground">Slug</dt>
								<dd class="mt-0.5 font-mono text-xs text-foreground">{selectedPlugin.slug}</dd>
							</div>
						</div>

						<!-- Keywords -->
												{#if parseKeywords(selectedPlugin.keywords).length}
							<div class="mt-4">
								<dt class="text-xs font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.KEYWORDS')}</dt>
								<dd class="mt-1.5 flex flex-wrap gap-1.5">
									{#each parseKeywords(selectedPlugin.keywords) as kw}
										<span class="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{kw}</span>
									{/each}
								</dd>
							</div>
						{/if}

						<!-- Compatibility -->
						{#if parseCompatibility(selectedPlugin.compatibility).length}
							<div class="mt-4">
								<dt class="text-xs font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.COMPATIBILITY')}</dt>
								<dd class="mt-1.5 space-y-1.5">
									{#each parseCompatibility(selectedPlugin.compatibility) as row}
										<div class="flex flex-wrap items-center gap-1.5 text-xs">
											<span class="min-w-12 font-medium text-foreground">{row.label}</span>
											{#each row.values as v}
												<span class="rounded-md bg-muted px-2 py-0.5 text-muted-foreground">{v}</span>
											{/each}
										</div>
									{/each}
								</dd>
							</div>
						{/if}

						<!-- Dependencies -->
												{#if parseDependencies(selectedPlugin.dependencies).length}
							<div class="mt-4">
								<dt class="text-xs font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.DEPENDENCIES')}</dt>
								<dd class="mt-1.5 flex flex-wrap gap-1.5">
									{#each parseDependencies(selectedPlugin.dependencies) as dep}
										<span class="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs">
											<span class="font-medium text-foreground">{dep.name}</span>
											{#if dep.version}
												<span class="text-muted-foreground">{dep.version}</span>
											{/if}
										</span>
									{/each}
								</dd>
							</div>
						{/if}
					</div>
				{:else}
					<div class="flex h-full items-center justify-center text-sm text-muted-foreground">
						{i18n.t('ADMIN_NEXT.PLUGINS.SELECT_A_PLUGIN_TO_VIEW_DETAILS')}
					</div>
				{/if}
			</div>
		</div>
		{/if}
	{/if}
</div>

<AddPluginModal
	open={addModalOpen}
	initialSearch={installSlug}
	onclose={() => { addModalOpen = false; installSlug = ''; if (page.url.searchParams.has('install')) goto(`${base}/plugins`, { replaceState: true }); }}
	oninstalled={handlePluginInstalled}
/>

<MarkdownModal
	open={changelogOpen}
	title={changelogTitle}
	content={changelogLoading ? 'Loading...' : changelogContent}
	onclose={() => { changelogOpen = false; }}
/>
