<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import { getInstalledThemes, checkUpdates, updatePackage, updateAllPackages, setActiveTheme, removeTheme, getThemeChangelog, type ThemeInfo } from '$lib/api/endpoints/gpm';
	import { reloadIfAdminUpdated, formatChangelog } from '$lib/utils/gpm';
	import { invalidations } from '$lib/stores/invalidation.svelte';
	import MarkdownModal from '$lib/components/ui/MarkdownModal.svelte';
	import { Button } from '$lib/components/ui/button';
	import StickyHeader from '$lib/components/ui/StickyHeader.svelte';
	import AddThemeModal from '$lib/components/AddThemeModal.svelte';
	import GravUpdateBanner from '$lib/components/GravUpdateBanner.svelte';
	import { toast } from 'svelte-sonner';
	import { Search, Palette, ExternalLink, ArrowUpCircle, Loader2, Plus, RefreshCw, BadgeCheck, Check, CornerDownRight, LayoutGrid, Table as TableIcon, Trash2, FileText, Book, Bug } from 'lucide-svelte';
	import { hostname } from '$lib/utils/url';
	import DirectionalIcon from '$lib/components/ui/DirectionalIcon.svelte';
	import { faIconClass, parseKeywords, parseDependencies, parseCompatibility, isFirstParty, descriptionText } from '$lib/utils/gpm';
	import { auth } from '$lib/stores/auth.svelte';
	import { canWrite } from '$lib/utils/permissions';
	import { dialogs } from '$lib/stores/dialogs.svelte';
	import { scopedKey } from '$lib/utils/scopedStorage';
	import { prefs } from '$lib/stores/preferences.svelte';
	import ThemesTableView from '$lib/components/themes/ThemesTableView.svelte';

	const SELECTED_STORAGE_KEY = 'admin-next:themes:selected-slug';

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

	let themes = $state<ThemeInfo[]>([]);
	let loading = $state(true);
	let search = $state('');
	let sortBy = $state<'name' | 'author' | 'enabled'>('name');
	let selectedSlug = $state<string | null>(null);
	let addModalOpen = $state(false);
	let installSlug = $state('');
	let checkingUpdates = $state(false);
	let updatingSlug = $state<string | null>(null);
	let updatingAll = $state(false);
	let activatingSlug = $state<string | null>(null);
	let removingSlug = $state<string | null>(null);

	// Auto-open install modal when navigating with ?install=slug (only if the
	// account can actually install — closes a URL-bypass of the gated Add button).
	$effect(() => {
		const slug = page.url.searchParams.get('install');
		if (slug && canWriteGpm) {
			installSlug = slug;
			addModalOpen = true;
		}
	});

	const updatableCount = $derived(themes.filter((t) => t.updatable).length);

	const filtered = $derived.by(() => {
		let list = [...themes];

		if (search) {
			const q = search.toLowerCase();
			list = list.filter(
				(t) =>
					t.name.toLowerCase().includes(q) ||
					t.slug.toLowerCase().includes(q) ||
					(t.description ?? '').toLowerCase().includes(q) ||
					(t.author?.name ?? '').toLowerCase().includes(q) ||
					parseKeywords(t.keywords).some((k) => k.toLowerCase().includes(q)),
			);
		}

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

	const selectedTheme = $derived(
		selectedSlug ? themes.find((t) => t.slug === selectedSlug) ?? null : null,
	);

	// Changelog modal
	let changelogOpen = $state(false);
	let changelogTitle = $state('');
	let changelogContent = $state('');
	let changelogLoading = $state(false);

	async function showChangelog(theme: ThemeInfo) {
		changelogLoading = true;
		changelogTitle = `${theme.name} — ${i18n.t('ADMIN_NEXT.PLUGINS.CHANGELOG')}`;
		changelogContent = '';
		changelogOpen = true;
		try {
			changelogContent = formatChangelog(await getThemeChangelog(theme.slug));
		} catch {
			changelogContent = '*Changelog not available.*';
		} finally {
			changelogLoading = false;
		}
	}

	function resolveUrl(url: string | null | undefined): string | null {
		if (!url) return null;
		if (url.startsWith('http')) return url;
		const base = auth.serverUrl ?? '';
		return `${base}${url}`;
	}

	async function loadThemes() {
		loading = true;
		try {
			themes = await getInstalledThemes();
			if (!selectedSlug && themes.length > 0) {
				const stored = readStoredSlug();
				const restored = stored && themes.some((t) => t.slug === stored) ? stored : null;
				selectedSlug = restored ?? themes[0].slug;
			}
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.THEMES.FAILED_TO_LOAD_THEMES'));
		} finally {
			loading = false;
		}
	}

	// Below the lg breakpoint the detail panel is hidden, so a single tap
	// would otherwise do nothing visible. Navigate straight to config instead.
	const hasDetailPanel = () =>
		typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;

	function selectTheme(slug: string) {
		if (!hasDetailPanel()) {
			openThemeConfig(slug);
			return;
		}
		selectedSlug = slug;
		writeStoredSlug(slug);
	}

	function openThemeConfig(slug: string) {
		goto(`${base}/themes/${slug}`);
	}

	async function handleCheckUpdates() {
		checkingUpdates = true;
		try {
			const result = await checkUpdates(true);
			toast.success(i18n.t('ADMIN_NEXT.TOASTS.GPM_REFRESHED', { n: result.total }));
			await loadThemes();
			// A flush check can uncover new updates; refresh the sidebar badges.
			invalidations.emit('gpm:update');
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.THEMES.FAILED_TO_CHECK_FOR_UPDATES'));
		} finally {
			checkingUpdates = false;
		}
	}

	async function handleUpdateTheme(theme: ThemeInfo, e: Event) {
		e.stopPropagation();
		const ok = await dialogs.confirm({
			title: 'Update theme?',
			message: `Update ${theme.name} to v${theme.available_version}?`,
			confirmLabel: 'Update',
		});
		if (!ok) return;
		updatingSlug = theme.slug;
		try {
			const result = await updatePackage(theme.slug);
			for (const depSlug of result.dependencies ?? []) {
				toast.success(i18n.t('ADMIN_NEXT.TOASTS.DEPENDENCY_INSTALLED', { slug: depSlug }));
			}
			toast.success(i18n.t('ADMIN_NEXT.TOASTS.PACKAGE_UPDATED', { name: theme.name }));
			await loadThemes();
			reloadIfAdminUpdated([theme.slug, ...(result.dependencies ?? [])]);
		} catch (err: unknown) {
			const detail = err instanceof Error ? err.message : String(err);
			toast.error(i18n.t('ADMIN_NEXT.TOASTS.PACKAGE_UPDATE_FAILED', { name: theme.name, detail }));
		} finally {
			updatingSlug = null;
		}
	}

	async function handleActivateTheme(theme: ThemeInfo, e: Event) {
		e.stopPropagation();
		if (theme.enabled) return;
		const ok = await dialogs.confirm({
			title: i18n.t('ADMIN_NEXT.THEMES.ACTIVATE_CONFIRM_TITLE'),
			message: i18n.t('ADMIN_NEXT.THEMES.ACTIVATE_CONFIRM_MESSAGE', { name: theme.name }),
			confirmLabel: i18n.t('ADMIN_NEXT.THEMES.ACTIVATE'),
		});
		if (!ok) return;
		activatingSlug = theme.slug;
		try {
			await setActiveTheme(theme.slug);
			toast.success(i18n.t('ADMIN_NEXT.TOASTS.THEME_ACTIVATED', { name: theme.name }));
			await loadThemes();
		} catch (err: unknown) {
			const detail = err instanceof Error ? err.message : String(err);
			toast.error(i18n.t('ADMIN_NEXT.TOASTS.THEME_ACTIVATE_FAILED', { name: theme.name, detail }));
		} finally {
			activatingSlug = null;
		}
	}

	async function handleRemoveTheme(theme: ThemeInfo, e: Event) {
		e.stopPropagation();
		const ok = await dialogs.confirm({
			title: i18n.t('ADMIN_NEXT.THEMES.REMOVE_CONFIRM_TITLE'),
			message: theme.enabled
				? i18n.t('ADMIN_NEXT.THEMES.REMOVE_ACTIVE_CONFIRM_MESSAGE', { name: theme.name })
				: i18n.t('ADMIN_NEXT.THEMES.REMOVE_CONFIRM_MESSAGE', { name: theme.name }),
			confirmLabel: i18n.t('ADMIN_NEXT.DELETE'),
			variant: 'destructive',
		});
		if (!ok) return;
		removingSlug = theme.slug;
		try {
			await removeTheme(theme.slug);
			toast.success(i18n.t('ADMIN_NEXT.TOASTS.THEME_REMOVED', { name: theme.name }));
			if (selectedSlug === theme.slug) {
				selectedSlug = null;
				writeStoredSlug(null);
			}
			await loadThemes();
		} catch (err: unknown) {
			const detail = err instanceof Error ? err.message : String(err);
			toast.error(i18n.t('ADMIN_NEXT.TOASTS.THEME_REMOVE_FAILED', { name: theme.name, detail }));
		} finally {
			removingSlug = null;
		}
	}

	async function handleUpdateAll() {
		const updatable = themes.filter((t) => t.updatable);
		const ok = await dialogs.confirm({
			title: i18n.t('ADMIN_NEXT.THEMES.UPDATE_ALL_CONFIRM_TITLE'),
			message: i18n.t('ADMIN_NEXT.THEMES.UPDATE_ALL_CONFIRM_MESSAGE', { n: updatable.length }),
			items: updatable.map((t) => `${t.name} → v${t.available_version}`),
			confirmLabel: i18n.t('ADMIN_NEXT.THEMES.UPDATE_ALL'),
		});
		if (!ok) return;
		updatingAll = true;
		try {
			const result = await updateAllPackages();
			// Cascaded deps that were themselves updatable land in `skipped`, not
			// `updated` — count them too so the toast matches what the user asked for.
			const okCount = result.updated.length + result.skipped.length;
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
			await loadThemes();
			reloadIfAdminUpdated([...result.updated, ...result.cascaded_dependencies]);
		} catch (err: unknown) {
			const detail = err instanceof Error ? err.message : String(err);
			toast.error(i18n.t('ADMIN_NEXT.TOASTS.UPDATE_FAILED', { detail }));
		} finally {
			updatingAll = false;
		}
	}

	function handleThemeInstalled() {
		loadThemes();
	}

	$effect(() => {
		loadThemes();
	});
</script>

<svelte:head>
	<title>{i18n.t('ADMIN_NEXT.THEMES.THEMES_GRAV_ADMIN')}</title>
</svelte:head>

<div class="flex h-full flex-col">
	<!-- Header -->
	<StickyHeader noBorder>
		{#snippet children({ scrolled })}
			<div class="px-6 transition-[padding] duration-200 {scrolled ? 'py-2' : 'pt-6 pb-3'}">
				<div class="flex items-center justify-between {scrolled ? 'min-h-6' : 'min-h-8'}">
					<div>
						<h1 class="font-semibold tracking-tight text-foreground transition-[font-size] duration-200 {scrolled ? 'text-sm' : 'text-xl'}">{i18n.t('ADMIN_NEXT.NAV.THEMES')}</h1>
						{#if !scrolled && !loading}
							<p class="mt-0.5 text-xs text-muted-foreground">{themes.length} installed</p>
						{/if}
					</div>
					{#if canWriteGpm}
					<div class="flex items-center gap-2">
						<Button variant="outline" size="sm" onclick={handleCheckUpdates} disabled={checkingUpdates || updatingAll}>
							<RefreshCw size={13} class={checkingUpdates ? 'animate-spin' : ''} />
							{i18n.t('ADMIN_NEXT.THEMES.CHECK_UPDATES')}
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

	<GravUpdateBanner onUpgraded={loadThemes} />

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
					placeholder={i18n.t('ADMIN_NEXT.THEMES.SEARCH_THEMES')}
					bind:value={search}
				/>
			</div>
			<select
				class="h-8 rounded-md border border-input bg-muted/50 px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
				bind:value={sortBy}
				disabled={prefs.themesViewMode === 'table'}
			>
				<option value="name">Name</option>
				<option value="author">{i18n.t('ADMIN_NEXT.AUTHOR')}</option>
				<option value="enabled">{i18n.t('ADMIN_NEXT.ACTIVE')}</option>
			</select>
			<div class="inline-flex rounded-md border border-border shadow-sm">
				<button
					class="inline-flex h-8 items-center gap-1.5 px-3 text-[0.75rem] font-medium transition-colors first:rounded-l-md last:rounded-r-md
						{prefs.themesViewMode === 'cards'
							? 'bg-accent text-accent-foreground'
							: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}"
					onclick={() => prefs.themesViewMode = 'cards'}
					title={i18n.t('ADMIN_NEXT.USERS_TABLE.CARDS')}
				>
					<LayoutGrid size={14} />
					<span class="hidden sm:inline">{i18n.t('ADMIN_NEXT.USERS_TABLE.CARDS')}</span>
				</button>
				<button
					class="inline-flex h-8 items-center gap-1.5 px-3 text-[0.75rem] font-medium transition-colors first:rounded-l-md last:rounded-r-md
						{prefs.themesViewMode === 'table'
							? 'bg-accent text-accent-foreground'
							: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}"
					onclick={() => prefs.themesViewMode = 'table'}
					title={i18n.t('ADMIN_NEXT.USERS_TABLE.TABLE')}
				>
					<TableIcon size={14} />
					<span class="hidden sm:inline">{i18n.t('ADMIN_NEXT.USERS_TABLE.TABLE')}</span>
				</button>
			</div>
		</div>

		{#if prefs.themesViewMode === 'table'}
			<div class="flex-1 overflow-y-auto">
				<ThemesTableView
					themes={filtered}
					canEdit={canWriteGpm}
					{updatingSlug}
					{updatingAll}
					{activatingSlug}
					{removingSlug}
					{resolveUrl}
					onConfigure={openThemeConfig}
					onUpdate={handleUpdateTheme}
					onChangelog={showChangelog}
					onActivate={handleActivateTheme}
					onRemove={handleRemoveTheme}
				/>
			</div>
		{:else}
		<!-- Main content: list + detail panel -->
		<div class="flex flex-1 overflow-hidden">
			<!-- Theme list -->
			<div class="w-full overflow-y-auto border-e border-border lg:w-[400px] xl:w-[440px]">
				{#each filtered as theme (theme.slug)}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
					<div
						class="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-start transition-colors
							{selectedSlug === theme.slug ? 'bg-accent' : 'hover:bg-muted/50'}"
						onclick={() => selectTheme(theme.slug)}
						ondblclick={() => openThemeConfig(theme.slug)}
					>
						<!-- Thumbnail -->
						<div class="flex h-[80px] w-[80px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
							{#if resolveUrl(theme.thumbnail)}
								<img
									src={resolveUrl(theme.thumbnail)}
									alt={theme.name}
									class="h-full w-full object-cover"
								/>
							{:else if theme.icon}
								<i class="{faIconClass(theme.icon)} text-2xl text-muted-foreground"></i>
							{:else}
								<Palette size={24} class="text-muted-foreground" />
							{/if}
						</div>

						<!-- Info -->
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-1.5">
								<span class="truncate text-sm font-medium text-foreground">{theme.name}</span>
								{#if isFirstParty(theme.author)}
									<BadgeCheck size={14} class="shrink-0 text-purple-500" />
								{/if}
								{#if theme.premium}
									<span class="shrink-0 rounded-full bg-red-500/15 px-1.5 py-0.5 text-[0.625rem] font-medium text-red-600 dark:text-red-400">{i18n.t('ADMIN_NEXT.PREMIUM')}</span>
								{/if}
								{#if theme.updatable}
									<ArrowUpCircle size={12} class="shrink-0 text-amber-500" />
								{/if}
							</div>
							<p class="truncate text-xs text-muted-foreground">{descriptionText(theme)}</p>
						</div>

						<!-- Symlink indicator -->
						{#if theme.is_symlink}
							<span class="inline-flex shrink-0" title={i18n.t('ADMIN_NEXT.THEMES.SYMLINKED')}><CornerDownRight size={14} class="text-muted-foreground/60" aria-label={i18n.t('ADMIN_NEXT.THEMES.SYMLINKED')} /></span>
						{/if}

						<!-- Active badge / Activate button -->
						{#if theme.enabled}
							<span class="shrink-0 rounded-full bg-green-500/15 px-2.5 py-0.5 text-[0.625rem] font-medium text-green-600 dark:text-green-400">
								<Check size={10} class="me-0.5 inline" /> {i18n.t('ADMIN_NEXT.ACTIVE')}
							</span>
						{:else if canWriteGpm}
							<button
								type="button"
								class="shrink-0 rounded-full border border-border bg-muted px-2.5 py-0.5 text-[0.625rem] font-medium text-muted-foreground transition-colors hover:bg-green-500/15 hover:text-green-600 disabled:opacity-50"
								onclick={(e) => handleActivateTheme(theme, e)}
								disabled={activatingSlug === theme.slug}
								title={i18n.t('ADMIN_NEXT.THEMES.ACTIVATE_THEME', { name: theme.name })}
							>
								{#if activatingSlug === theme.slug}
									<Loader2 size={10} class="me-0.5 inline animate-spin" />
								{/if}
								{i18n.t('ADMIN_NEXT.THEMES.ACTIVATE')}
							</button>
						{/if}

						{#if canWriteGpm}
							<button
								type="button"
								class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
								aria-label={i18n.t('ADMIN_NEXT.DELETE')}
								title={theme.enabled ? i18n.t('ADMIN_NEXT.THEMES.DELETE_ACTIVE_WARNING') : i18n.t('ADMIN_NEXT.DELETE')}
								onclick={(e) => handleRemoveTheme(theme, e)}
								disabled={removingSlug === theme.slug}
							>
								{#if removingSlug === theme.slug}
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
						{search ? 'No themes match your search' : 'No themes installed'}
					</div>
				{/if}
			</div>

			<!-- Detail panel -->
			<div class="hidden flex-1 overflow-y-auto lg:block">
				{#if selectedTheme}
					<div class="p-6">
						<!-- Screenshot -->
						{#if resolveUrl(selectedTheme.screenshot)}
							<div class="mx-auto mb-5 max-w-[500px] overflow-hidden rounded-xl border border-border">
								<img
									src={resolveUrl(selectedTheme.screenshot)}
									alt={selectedTheme.name}
									class="w-full"
								/>
							</div>
						{/if}

						<!-- Theme header -->
						<div class="flex items-start gap-4">
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-1.5">
									<h2 class="text-lg font-semibold text-foreground">{selectedTheme.name}</h2>
									{#if isFirstParty(selectedTheme.author)}
										<BadgeCheck size={18} class="shrink-0 text-purple-500" />
									{/if}
									{#if selectedTheme.is_symlink}
										<span class="inline-flex shrink-0" title={i18n.t('ADMIN_NEXT.THEMES.SYMLINKED')}><CornerDownRight size={14} class="text-muted-foreground/60" aria-label={i18n.t('ADMIN_NEXT.THEMES.SYMLINKED')} /></span>
									{/if}
									{#if selectedTheme.premium}
										<span class="shrink-0 rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">{i18n.t('ADMIN_NEXT.PREMIUM')}</span>
									{/if}
									{#if selectedTheme.enabled}
										<span class="rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-600 dark:text-green-400">{i18n.t('ADMIN_NEXT.ACTIVE')}</span>
									{/if}
								</div>
								<div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
									<span>v{selectedTheme.version}</span>
									{#if selectedTheme.author?.name}
										<span>by {selectedTheme.author.name}</span>
									{/if}
									{#if selectedTheme.updatable}
										<span class="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-600 dark:text-amber-400">
											{i18n.t('ADMIN_NEXT.UPDATE_AVAILABLE_VERSION', { version: selectedTheme.available_version })}
										</span>
									{/if}
								</div>
							</div>
							<div class="flex items-center gap-2">
								{#if !selectedTheme.enabled && canWriteGpm}
									<Button
										variant="outline"
										size="sm"
										onclick={(e: Event) => handleActivateTheme(selectedTheme, e)}
										disabled={activatingSlug === selectedTheme.slug}
									>
										{#if activatingSlug === selectedTheme.slug}
											<Loader2 size={14} class="me-1.5 animate-spin" />
										{:else}
											<Check size={14} class="me-1.5" />
										{/if}
										{i18n.t('ADMIN_NEXT.THEMES.ACTIVATE')}
									</Button>
								{/if}
								{#if selectedTheme.updatable && canWriteGpm}
									<Button
										variant="outline"
										size="sm"
										onclick={(e: Event) => handleUpdateTheme(selectedTheme, e)}
										disabled={updatingSlug === selectedTheme.slug || updatingAll}
									>
										{#if updatingSlug === selectedTheme.slug}
											<Loader2 size={14} class="me-1.5 animate-spin" />
										{:else}
											<ArrowUpCircle size={14} class="me-1.5" />
										{/if}
										{i18n.t('ADMIN_NEXT.UPDATE_TO_VERSION', { version: selectedTheme.available_version })}
									</Button>
								{/if}
								{#if canWriteGpm}
									<button
										type="button"
										class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
										aria-label={i18n.t('ADMIN_NEXT.DELETE')}
										title={selectedTheme.enabled ? i18n.t('ADMIN_NEXT.THEMES.DELETE_ACTIVE_WARNING') : i18n.t('ADMIN_NEXT.DELETE')}
										onclick={(e: Event) => handleRemoveTheme(selectedTheme, e)}
										disabled={removingSlug === selectedTheme.slug}
									>
										{#if removingSlug === selectedTheme.slug}
											<Loader2 size={14} class="animate-spin" />
										{:else}
											<Trash2 size={14} />
										{/if}
									</button>
								{/if}
								<button
									type="button"
									class="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
									onclick={() => openThemeConfig(selectedTheme.slug)}
								>
									{i18n.t('ADMIN_NEXT.THEMES.CONFIGURE')}
									<DirectionalIcon name="chevron-forward" size={14} />
								</button>
							</div>
						</div>

						<!-- Description -->
						{#if selectedTheme.description}
							{#if selectedTheme.description_html}
								<div class="prose prose-sm dark:prose-invert mt-4 max-w-none text-sm leading-relaxed text-muted-foreground [&_a]:text-primary [&_a]:no-underline hover:[&_a]:underline [&_p]:my-0 [&_p+p]:mt-2">
									{@html selectedTheme.description_html}
								</div>
							{:else}
								<p class="mt-4 text-sm leading-relaxed text-muted-foreground">
									{selectedTheme.description}
								</p>
							{/if}
						{/if}

						<!-- Links -->
						<div class="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
							<button type="button" class="inline-flex items-center gap-1 hover:text-foreground" onclick={() => selectedTheme && showChangelog(selectedTheme)}>
								<FileText size={12} /> {i18n.t('ADMIN_NEXT.PLUGINS.CHANGELOG')}
							</button>
							{#if selectedTheme.docs}
								<a href={selectedTheme.docs} target="_blank" rel="noopener" class="inline-flex items-center gap-1 hover:text-foreground">
									<Book size={12} /> {i18n.t('ADMIN_NEXT.DOCUMENTATION')} <ExternalLink size={10} />
								</a>
							{/if}
							{#if selectedTheme.bugs}
								<a href={selectedTheme.bugs} target="_blank" rel="noopener" class="inline-flex items-center gap-1 hover:text-foreground">
									<Bug size={12} /> {i18n.t('ADMIN_NEXT.REPORT_ISSUE')} <ExternalLink size={10} />
								</a>
							{/if}
						</div>

						<!-- Metadata grid -->
						<div class="mt-6 grid grid-cols-2 gap-4">
							{#if selectedTheme.author?.name}
								<div>
									<dt class="text-xs font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.AUTHOR')}</dt>
									<dd class="mt-0.5 text-sm text-foreground">
										{#if selectedTheme.author.url}
											<a href={selectedTheme.author.url} target="_blank" rel="noopener" class="text-primary hover:underline">
												{selectedTheme.author.name}
												<ExternalLink size={10} class="inline" />
											</a>
										{:else}
											{selectedTheme.author.name}
										{/if}
									</dd>
								</div>
							{/if}

							{#if selectedTheme.homepage}
								<div>
									<dt class="text-xs font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.HOMEPAGE')}</dt>
									<dd class="mt-0.5 text-sm">
										<a href={selectedTheme.homepage} target="_blank" rel="noopener" class="text-primary hover:underline">
											{hostname(selectedTheme.homepage)}
											<ExternalLink size={10} class="inline" />
										</a>
									</dd>
								</div>
							{/if}

							<div>
								<dt class="text-xs font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.PAGES.HEADER_STATUS')}</dt>
								<dd class="mt-0.5 text-sm">
									<span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
										{selectedTheme.enabled
											? 'bg-green-500/15 text-green-600 dark:text-green-400'
											: 'bg-muted text-muted-foreground'}">
										{selectedTheme.enabled ? 'Active' : 'Inactive'}
									</span>
								</dd>
							</div>

							<div>
								<dt class="text-xs font-medium text-muted-foreground">Slug</dt>
								<dd class="mt-0.5 font-mono text-xs text-foreground">{selectedTheme.slug}</dd>
							</div>
						</div>

						<!-- Keywords -->
						{#if parseKeywords(selectedTheme.keywords).length}
							<div class="mt-4">
								<dt class="text-xs font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.KEYWORDS')}</dt>
								<dd class="mt-1.5 flex flex-wrap gap-1.5">
									{#each parseKeywords(selectedTheme.keywords) as kw}
										<span class="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{kw}</span>
									{/each}
								</dd>
							</div>
						{/if}

						<!-- Compatibility -->
						{#if parseCompatibility(selectedTheme.compatibility).length}
							<div class="mt-4">
								<dt class="text-xs font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.COMPATIBILITY')}</dt>
								<dd class="mt-1.5 space-y-1.5">
									{#each parseCompatibility(selectedTheme.compatibility) as row}
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
						{#if parseDependencies(selectedTheme.dependencies).length}
							<div class="mt-4">
								<dt class="text-xs font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.DEPENDENCIES')}</dt>
								<dd class="mt-1.5 flex flex-wrap gap-1.5">
									{#each parseDependencies(selectedTheme.dependencies) as dep}
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
						{i18n.t('ADMIN_NEXT.THEMES.SELECT_A_THEME_TO_VIEW_DETAILS')}
					</div>
				{/if}
			</div>
		</div>
		{/if}
	{/if}
</div>

<AddThemeModal
	open={addModalOpen}
	initialSearch={installSlug}
	onclose={() => { addModalOpen = false; installSlug = ''; if (page.url.searchParams.has('install')) goto(`${base}/themes`, { replaceState: true }); }}
	oninstalled={handleThemeInstalled}
/>

<MarkdownModal
	open={changelogOpen}
	title={changelogTitle}
	content={changelogLoading ? 'Loading...' : changelogContent}
	onclose={() => { changelogOpen = false; }}
/>
