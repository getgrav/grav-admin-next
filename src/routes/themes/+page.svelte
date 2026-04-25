<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { getInstalledThemes, checkUpdates, updatePackage, updateAllPackages, type ThemeInfo } from '$lib/api/endpoints/gpm';
	import { Button } from '$lib/components/ui/button';
	import StickyHeader from '$lib/components/ui/StickyHeader.svelte';
	import AddThemeModal from '$lib/components/AddThemeModal.svelte';
	import { toast } from 'svelte-sonner';
	import { Search, Palette, ExternalLink, ArrowUpCircle, ChevronRight, Loader2, Plus, RefreshCw, BadgeCheck, Check, CornerDownRight } from 'lucide-svelte';
	import { faIconClass, parseKeywords, parseDependencies, isFirstParty, descriptionText } from '$lib/utils/gpm';
	import { auth } from '$lib/stores/auth.svelte';
	import { canWrite } from '$lib/utils/permissions';
	import { dialogs } from '$lib/stores/dialogs.svelte';

	const canWriteGpm = $derived(canWrite('gpm'));

	let themes = $state<ThemeInfo[]>([]);
	let loading = $state(true);
	let search = $state('');
	let sortBy = $state<'name' | 'author' | 'enabled'>('name');
	let selectedSlug = $state<string | null>(null);
	let addModalOpen = $state(false);
	let checkingUpdates = $state(false);
	let updatingSlug = $state<string | null>(null);
	let updatingAll = $state(false);

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
					return a.name.localeCompare(b.name);
			}
		});

		return list;
	});

	const selectedTheme = $derived(
		selectedSlug ? themes.find((t) => t.slug === selectedSlug) ?? null : null,
	);

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
				selectedSlug = themes[0].slug;
			}
		} catch {
			toast.error('Failed to load themes');
		} finally {
			loading = false;
		}
	}

	function selectTheme(slug: string) {
		selectedSlug = slug;
	}

	function openThemeConfig(slug: string) {
		goto(`${base}/themes/${slug}`);
	}

	async function handleCheckUpdates() {
		checkingUpdates = true;
		try {
			const result = await checkUpdates(true);
			toast.success(`GPM refreshed — ${result.total} update${result.total !== 1 ? 's' : ''} available`);
			await loadThemes();
		} catch {
			toast.error('Failed to check for updates');
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
				toast.success(`Plugin '${depSlug}' installed (dependency)`);
			}
			toast.success(`${theme.name} updated`);
			await loadThemes();
		} catch (err: unknown) {
			const detail = err instanceof Error ? err.message : String(err);
			toast.error(`Failed to update ${theme.name}: ${detail}`);
		} finally {
			updatingSlug = null;
		}
	}

	async function handleUpdateAll() {
		const ok = await dialogs.confirm({
			title: 'Update all packages?',
			message: `This will update ${updatableCount} package${updatableCount !== 1 ? 's' : ''} (plugins and themes). Continue?`,
			confirmLabel: 'Update All',
		});
		if (!ok) return;
		updatingAll = true;
		try {
			const result = await updateAllPackages();
			const okCount = result.updated.length;
			const bad = result.failed.length;
			if (bad === 0) {
				toast.success(`Updated ${okCount} package${okCount !== 1 ? 's' : ''}`);
			} else {
				const reasons = result.failed
					.map((f) => `${f.package}: ${f.error}`)
					.join('\n');
				toast.error(
					okCount > 0
						? `Updated ${okCount}, failed ${bad}.\n${reasons}`
						: `${bad} update${bad !== 1 ? 's' : ''} failed.\n${reasons}`,
				);
			}
			await loadThemes();
		} catch (err: unknown) {
			const detail = err instanceof Error ? err.message : String(err);
			toast.error(`Update failed: ${detail}`);
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
	<title>Themes — Grav Admin</title>
</svelte:head>

<div class="flex h-full flex-col">
	<!-- Header -->
	<StickyHeader noBorder>
		{#snippet children({ scrolled })}
			<div class="px-6 transition-[padding] duration-200 {scrolled ? 'py-2' : 'pt-6 pb-3'}">
				<div class="flex items-center justify-between {scrolled ? 'min-h-6' : 'min-h-8'}">
					<div>
						<h1 class="font-semibold tracking-tight text-foreground transition-[font-size] duration-200 {scrolled ? 'text-sm' : 'text-xl'}">Themes</h1>
						{#if !scrolled && !loading}
							<p class="mt-0.5 text-xs text-muted-foreground">{themes.length} installed</p>
						{/if}
					</div>
					{#if canWriteGpm}
					<div class="flex items-center gap-2">
						<Button variant="outline" size="sm" onclick={handleCheckUpdates} disabled={checkingUpdates || updatingAll}>
							<RefreshCw size={13} class={checkingUpdates ? 'animate-spin' : ''} />
							Check Updates
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
					class="h-8 w-full rounded-md border border-input bg-muted/50 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
					placeholder="Search themes..."
					bind:value={search}
				/>
			</div>
			<select
				class="h-8 rounded-md border border-input bg-muted/50 px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
				bind:value={sortBy}
			>
				<option value="name">Name</option>
				<option value="author">Author</option>
				<option value="enabled">Active</option>
			</select>
		</div>

		<!-- Main content: list + detail panel -->
		<div class="flex flex-1 overflow-hidden">
			<!-- Theme list -->
			<div class="w-full overflow-y-auto border-r border-border lg:w-[400px] xl:w-[440px]">
				{#each filtered as theme (theme.slug)}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
					<div
						class="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors
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
									<span class="shrink-0 rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400">Premium</span>
								{/if}
								{#if theme.updatable}
									<ArrowUpCircle size={12} class="shrink-0 text-amber-500" />
								{/if}
							</div>
							<p class="truncate text-xs text-muted-foreground">{descriptionText(theme)}</p>
						</div>

						<!-- Symlink indicator -->
						{#if theme.is_symlink}
							<span class="inline-flex shrink-0" title="Symlinked"><CornerDownRight size={14} class="text-muted-foreground/60" aria-label="Symlinked" /></span>
						{/if}

						<!-- Active badge -->
						{#if theme.enabled}
							<span class="shrink-0 rounded-full bg-green-500/15 px-2.5 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">
								<Check size={10} class="mr-0.5 inline" /> Active
							</span>
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
										<span class="inline-flex shrink-0" title="Symlinked"><CornerDownRight size={14} class="text-muted-foreground/60" aria-label="Symlinked" /></span>
									{/if}
									{#if selectedTheme.premium}
										<span class="shrink-0 rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">Premium</span>
									{/if}
									{#if selectedTheme.enabled}
										<span class="rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-600 dark:text-green-400">Active</span>
									{/if}
								</div>
								<div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
									<span>v{selectedTheme.version}</span>
									{#if selectedTheme.author?.name}
										<span>by {selectedTheme.author.name}</span>
									{/if}
									{#if selectedTheme.updatable}
										<span class="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-600 dark:text-amber-400">
											Update available: v{selectedTheme.available_version}
										</span>
									{/if}
								</div>
							</div>
							<div class="flex items-center gap-2">
								{#if selectedTheme.updatable && canWriteGpm}
									<Button
										variant="outline"
										size="sm"
										onclick={(e: Event) => handleUpdateTheme(selectedTheme, e)}
										disabled={updatingSlug === selectedTheme.slug || updatingAll}
									>
										{#if updatingSlug === selectedTheme.slug}
											<Loader2 size={14} class="mr-1.5 animate-spin" />
										{:else}
											<ArrowUpCircle size={14} class="mr-1.5" />
										{/if}
										Update to v{selectedTheme.available_version}
									</Button>
								{/if}
								<button
									type="button"
									class="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
									onclick={() => openThemeConfig(selectedTheme.slug)}
								>
									Configure
									<ChevronRight size={14} />
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

						<!-- Metadata grid -->
						<div class="mt-6 grid grid-cols-2 gap-4">
							{#if selectedTheme.author?.name}
								<div>
									<dt class="text-xs font-medium text-muted-foreground">Author</dt>
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
									<dt class="text-xs font-medium text-muted-foreground">Homepage</dt>
									<dd class="mt-0.5 text-sm">
										<a href={selectedTheme.homepage} target="_blank" rel="noopener" class="text-primary hover:underline">
											Visit
											<ExternalLink size={10} class="inline" />
										</a>
									</dd>
								</div>
							{/if}

							<div>
								<dt class="text-xs font-medium text-muted-foreground">Status</dt>
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
								<dt class="text-xs font-medium text-muted-foreground">Keywords</dt>
								<dd class="mt-1.5 flex flex-wrap gap-1.5">
									{#each parseKeywords(selectedTheme.keywords) as kw}
										<span class="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{kw}</span>
									{/each}
								</dd>
							</div>
						{/if}

						<!-- Dependencies -->
						{#if parseDependencies(selectedTheme.dependencies).length}
							<div class="mt-4">
								<dt class="text-xs font-medium text-muted-foreground">Dependencies</dt>
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
						Select a theme to view details
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<AddThemeModal
	open={addModalOpen}
	onclose={() => (addModalOpen = false)}
	oninstalled={handleThemeInstalled}
/>
