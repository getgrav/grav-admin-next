<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { createPage } from '$lib/api/endpoints/pages';
	import { getPageTypes, type PageType } from '$lib/api/endpoints/blueprints';
	import { getChildren, type PageSummary } from '$lib/api/endpoints/pages';
	import { contentLang } from '$lib/stores/contentLang.svelte';
	import { Button } from '$lib/components/ui/button';
	import StickyHeader from '$lib/components/ui/StickyHeader.svelte';
	import { toast } from 'svelte-sonner';
	import {
		ArrowLeft, FilePlus, Loader2, Save,
		ChevronRight, ChevronDown, Folder, FolderOpen, File,
		Check, Search, X, ChevronsUpDown, RefreshCw,
	} from 'lucide-svelte';

	// ── Form state ──────────────────────────────────────────────────
	let title = $state('');
	let slug = $state('');
	let slugManuallyEdited = $state(false);
	let parentRoute = $state('/');
	let template = $state('default');
	let visible = $state<'auto' | 'yes' | 'no'>('auto');
	let saving = $state(false);

	// ── Data ────────────────────────────────────────────────────────
	let pageTypes = $state<PageType[]>([]);
	let pageTypesLoading = $state(true);

	// Parent page picker state
	let parentOpen = $state(false);
	let parentFilter = $state('');
	let rootPages = $state<PageSummary[]>([]);
	let childrenCache = $state<Record<string, PageSummary[]>>({});
	let expandedRoutes = $state<Set<string>>(new Set());
	let loadingRoutes = $state<Set<string>>(new Set());
	let rootLoading = $state(false);
	let filterInputEl = $state<HTMLInputElement | null>(null);

	// ── Derived ─────────────────────────────────────────────────────
	const canSave = $derived(title.trim().length > 0 && slug.trim().length > 0 && template.length > 0);

	const parentLabel = $derived(() => {
		if (parentRoute === '/') return '<root> /';
		const found = findPageTitle([...rootPages], parentRoute);
		return found ? `${parentRoute} — ${found}` : parentRoute;
	});

	// ── Init ────────────────────────────────────────────────────────
	$effect(() => {
		loadPageTypes();
	});

	async function loadPageTypes() {
		pageTypesLoading = true;
		try {
			pageTypes = await getPageTypes();
			// Set default template
			if (pageTypes.length > 0 && !pageTypes.find(t => t.type === 'default')) {
				template = pageTypes[0].type;
			}
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.PAGES.NEW.FAILED_TO_LOAD_PAGE_TEMPLATES'));
		} finally {
			pageTypesLoading = false;
		}
	}

	// ── Slugify ─────────────────────────────────────────────────────
	function slugify(str: string): string {
		return str
			.toString()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.trim()
			.replace(/[''\u2019]/g, '')
			.replace(/[^a-z0-9\s_-]/g, '')
			.replace(/[\s_]+/g, '-')
			.replace(/-+/g, '-')
			.replace(/^-|-$/g, '');
	}

	function handleTitleInput(e: Event) {
		title = (e.target as HTMLInputElement).value;
		if (!slugManuallyEdited) {
			slug = slugify(title);
		}
	}

	function handleSlugInput(e: Event) {
		let val = (e.target as HTMLInputElement).value;
		val = val.toLowerCase().replace(/\s/g, '-').replace(/[^a-z0-9_-]/g, '');
		slug = val;
		slugManuallyEdited = true;
	}

	function regenerateSlug() {
		slug = slugify(title);
		slugManuallyEdited = false;
	}

	// ── Parent page picker ──────────────────────────────────────────
	function findPageTitle(pages: PageSummary[], route: string): string | null {
		for (const p of pages) {
			if (p.route === route) return p.title;
			const cached = childrenCache[p.route];
			if (cached) {
				const found = findPageTitle(cached, route);
				if (found) return found;
			}
		}
		return null;
	}

	async function loadRoot() {
		if (rootPages.length > 0) return;
		rootLoading = true;
		try {
			rootPages = await getChildren('/', 'title', 'asc');
			childrenCache = { '/': rootPages };
		} catch { /* handled */ }
		finally { rootLoading = false; }
	}

	async function loadChildren(route: string) {
		if (childrenCache[route]) return;
		loadingRoutes = new Set([...loadingRoutes, route]);
		try {
			const children = await getChildren(route, 'title', 'asc');
			childrenCache = { ...childrenCache, [route]: children };
		} catch {
			childrenCache = { ...childrenCache, [route]: [] };
		} finally {
			const next = new Set(loadingRoutes);
			next.delete(route);
			loadingRoutes = next;
		}
	}

	async function toggleExpand(route: string, e: Event) {
		e.stopPropagation();
		const next = new Set(expandedRoutes);
		if (next.has(route)) {
			next.delete(route);
		} else {
			next.add(route);
			await loadChildren(route);
		}
		expandedRoutes = next;
	}

	function selectParent(route: string) {
		parentRoute = route;
		parentOpen = false;
		parentFilter = '';
	}

	function handleParentOpen() {
		parentOpen = !parentOpen;
		if (parentOpen) {
			loadRoot();
			requestAnimationFrame(() => filterInputEl?.focus());
		}
	}

	function handleParentKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			parentOpen = false;
			parentFilter = '';
		}
	}

	function handleParentClickOutside(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (!target.closest('.parent-picker')) {
			parentOpen = false;
			parentFilter = '';
		}
	}

	function filterPages(pages: PageSummary[]): PageSummary[] {
		if (!parentFilter) return pages;
		const q = parentFilter.toLowerCase();
		return pages.filter(p =>
			p.title.toLowerCase().includes(q) ||
			p.route.toLowerCase().includes(q)
		);
	}

	$effect(() => {
		if (parentOpen) {
			document.addEventListener('mousedown', handleParentClickOutside);
			return () => document.removeEventListener('mousedown', handleParentClickOutside);
		}
	});

	// ── Create ──────────────────────────────────────────────────────
	async function handleCreate() {
		if (!canSave || saving) return;
		saving = true;
		try {
			const route = parentRoute === '/' ? `/${slug}` : `${parentRoute}/${slug}`;
			const order = visible === 'yes' || visible === 'auto' ? 1 : undefined;
			const header: Record<string, unknown> = {};
			if (visible === 'yes') header.visible = true;
			if (visible === 'no') header.visible = false;

			await createPage({
				route,
				title,
				template,
				order,
				header,
				lang: contentLang.activeLang || undefined,
			});

			toast.success(`Page "${title}" created`);
			goto(`${base}/pages/edit${route}`);
		} catch (err: unknown) {
			const message = err && typeof err === 'object' && 'message' in err
				? (err as { message: string }).message
				: 'Failed to create page';
			toast.error(message);
		} finally {
			saving = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 's') {
			e.preventDefault();
			if (canSave && !saving) handleCreate();
		}
	}
</script>

<svelte:head>
	<title>{i18n.t('ADMIN_NEXT.PAGES.NEW.ADD_PAGE_GRAV_ADMIN')}</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="flex h-full flex-col">
	<!-- Header -->
	<StickyHeader>
		{#snippet children({ scrolled })}
			<div class="px-6 transition-[padding] duration-200 {scrolled ? 'py-2' : 'pt-6 pb-3'}">
				<div class="flex items-center justify-between gap-4 {scrolled ? 'min-h-6' : 'min-h-8'}">
					<div class="flex items-center gap-3">
						<button
							type="button"
							class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
							onclick={() => goto(`${base}/pages`)}
						>
							<ArrowLeft size={16} />
						</button>
						{#if !scrolled}
							<div class="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
								<FilePlus size={16} />
							</div>
						{/if}
						<h1 class="font-semibold text-foreground transition-[font-size] duration-200 {scrolled ? 'text-sm' : 'text-lg'}">{i18n.t('ADMIN_NEXT.ADD_PAGE')}</h1>
					</div>

					<Button
						size="sm"
						onclick={handleCreate}
						disabled={!canSave || saving}
					>
						{#if saving}
							<Loader2 size={14} class="mr-1.5 animate-spin" />
						{:else}
							<Save size={14} class="mr-1.5" />
						{/if}
						{i18n.t('ADMIN_NEXT.PAGES.NEW.CONTINUE')}
					</Button>
				</div>
			</div>
		{/snippet}
	</StickyHeader>

	<!-- Content -->
	<div class="flex-1 overflow-y-auto">
		<div class="mx-auto max-w-2xl space-y-6 px-6 py-6">
			<div class="rounded-xl border border-border bg-card p-5">
				<h2 class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.PAGES.NEW.PAGE_DETAILS')}</h2>
				<div class="mt-4 space-y-5">

					<!-- Page Title -->
					<div>
						<label for="page-title" class="block text-xs font-medium text-muted-foreground">
							{i18n.t('ADMIN_NEXT.PAGES.NEW.PAGE_TITLE')} <span class="text-destructive">*</span>
						</label>
						<input
							id="page-title"
							type="text"
							value={title}
							oninput={handleTitleInput}
							placeholder={i18n.t('ADMIN_NEXT.PAGES.NEW.MY_NEW_PAGE')}
							class="mt-1 h-10 w-full rounded-lg border border-input bg-muted/50 px-3 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
						/>
					</div>

					<!-- Folder Name (Slug) -->
					<div>
						<label for="page-slug" class="block text-xs font-medium text-muted-foreground">
							{i18n.t('ADMIN_NEXT.PAGES.NEW.FOLDER_NAME')} <span class="text-destructive">*</span>
						</label>
						<p class="mt-0.5 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.PAGES.NEW.URL_SAFE_FOLDER_NAME_FOR_THIS_PAGE')}</p>
						<div class="mt-1 flex items-stretch">
							<input
								id="page-slug"
								type="text"
								value={slug}
								oninput={handleSlugInput}
								placeholder="my-new-page"
								class="flex h-10 min-w-0 flex-1 rounded-l-lg border border-r-0 border-input bg-muted/50 px-3 font-mono text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
							/>
							<button
								type="button"
								class="flex h-10 w-10 shrink-0 items-center justify-center rounded-r-lg border border-input bg-muted/50 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
								onclick={regenerateSlug}
								title={i18n.t('ADMIN_NEXT.FIELDS.REGENERATE_SLUG')}
							>
								<RefreshCw size={14} />
							</button>
						</div>
					</div>

					<!-- Parent Page -->
					<div>
						<label class="block text-xs font-medium text-muted-foreground">
							{i18n.t('ADMIN_NEXT.PAGES.NEW.PARENT_PAGE')} <span class="text-destructive">*</span>
						</label>
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="parent-picker relative mt-1" onkeydown={handleParentKeydown}>
							<button
								type="button"
								class="flex h-10 w-full items-center justify-between rounded-lg border border-input bg-muted/50 px-3 py-2 text-sm shadow-sm transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
								onclick={handleParentOpen}
							>
								<span class="text-foreground">{parentLabel()}</span>
								<ChevronsUpDown size={14} class="shrink-0 text-muted-foreground" />
							</button>

							{#if parentOpen}
								<div class="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
									<div class="flex items-center gap-2 border-b border-border px-3 py-2">
										<Search size={14} class="shrink-0 text-muted-foreground" />
										<input
											bind:this={filterInputEl}
											type="text"
											class="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
											placeholder={i18n.t('ADMIN_NEXT.PAGES.NEW.FILTER_PAGES')}
											bind:value={parentFilter}
										/>
										{#if parentFilter}
											<button
												type="button"
												class="shrink-0 text-muted-foreground hover:text-foreground"
												onclick={() => { parentFilter = ''; filterInputEl?.focus(); }}
											>
												<X size={14} />
											</button>
										{/if}
									</div>

									<div class="max-h-72 overflow-y-auto p-1">
										{#if rootLoading}
											<div class="flex items-center justify-center py-6 text-sm text-muted-foreground">
												<Loader2 size={16} class="mr-2 animate-spin" />
												{i18n.t('ADMIN_NEXT.PAGES.LOADING')}
											</div>
										{:else}
											<!-- Root option -->
											<button
												type="button"
												class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors
													{parentRoute === '/' ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-accent'}"
												onclick={() => selectParent('/')}
											>
												<Folder size={14} class="shrink-0 text-muted-foreground" />
												<span class="truncate">{i18n.t('ADMIN_NEXT.PAGES.NEW.ROOT')}</span>
												{#if parentRoute === '/'}
													<Check size={14} class="ml-auto shrink-0 text-primary" />
												{/if}
											</button>

											{#each filterPages(rootPages) as pg (pg.route)}
												{@render parentNode(pg, 0)}
											{/each}

											{#if !rootLoading && filterPages(rootPages).length === 0 && parentFilter}
												<div class="py-4 text-center text-sm text-muted-foreground">{i18n.t('ADMIN_NEXT.PAGES.NO_PAGES')}</div>
											{/if}
										{/if}
									</div>
								</div>
							{/if}
						</div>
					</div>

					<!-- Page Template -->
					<div>
						<label for="page-template" class="block text-xs font-medium text-muted-foreground">
							{i18n.t('ADMIN_NEXT.PAGES.NEW.PAGE_TEMPLATE')} <span class="text-destructive">*</span>
						</label>
						<select
							id="page-template"
							bind:value={template}
							disabled={pageTypesLoading}
							class="mt-1 h-10 w-full rounded-lg border border-input bg-muted/50 px-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
						>
							{#if pageTypesLoading}
								<option value="">{i18n.t('ADMIN_NEXT.PAGES.NEW.LOADING_TEMPLATES')}</option>
							{:else}
								{#each pageTypes as pt}
									<option value={pt.type}>{pt.label}</option>
								{/each}
							{/if}
						</select>
					</div>

					<!-- Visible -->
					<div>
						<label class="block text-xs font-medium text-muted-foreground">
							{i18n.t('ADMIN_NEXT.PAGES.NEW.VISIBLE')} <span class="text-destructive">*</span>
						</label>
						<p class="mt-0.5 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.PAGES.NEW.CONTROLS_WHETHER_THIS_PAGE_APPEARS_IN')}</p>
						<div class="mt-2 inline-flex rounded-lg border border-input">
							{#each (['auto', 'yes', 'no'] as const) as opt}
								<button
									type="button"
									class="px-4 py-1.5 text-sm font-medium capitalize transition-colors first:rounded-l-lg last:rounded-r-lg
										{visible === opt
											? 'bg-primary text-primary-foreground'
											: 'bg-muted/50 text-foreground hover:bg-muted'}"
									onclick={() => visible = opt}
								>
									{opt === 'auto' ? 'Auto' : opt === 'yes' ? 'Yes' : 'No'}
								</button>
							{/each}
						</div>
					</div>

				</div>
			</div>
		</div>
	</div>
</div>

{#snippet parentNode(pg: PageSummary, depth: number)}
	{@const isExpanded = expandedRoutes.has(pg.route)}
	{@const isLoading = loadingRoutes.has(pg.route)}
	{@const isSelected = parentRoute === pg.route}
	{@const children = childrenCache[pg.route]}
	{@const filtered = children ? filterPages(children) : []}

	<div style="padding-left: {depth * 16}px">
		<button
			type="button"
			class="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors
				{isSelected ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-accent'}"
			onclick={() => selectParent(pg.route)}
		>
			{#if pg.has_children}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<span
					class="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
					onclick={(e) => toggleExpand(pg.route, e)}
					role="button"
					tabindex="-1"
				>
					{#if isLoading}
						<Loader2 size={12} class="animate-spin" />
					{:else if isExpanded}
						<ChevronDown size={12} />
					{:else}
						<ChevronRight size={12} />
					{/if}
				</span>
			{:else}
				<span class="w-5 shrink-0"></span>
			{/if}

			{#if pg.has_children}
				{#if isExpanded}
					<FolderOpen size={14} class="shrink-0 text-muted-foreground" />
				{:else}
					<Folder size={14} class="shrink-0 text-muted-foreground" />
				{/if}
			{:else}
				<File size={14} class="shrink-0 text-muted-foreground" />
			{/if}

			<span class="min-w-0 truncate">
				<span class="text-muted-foreground">({pg.slug})</span>
				{pg.title}
			</span>

			{#if isSelected}
				<Check size={14} class="ml-auto shrink-0 text-primary" />
			{/if}
		</button>
	</div>

	{#if isExpanded && children}
		{#each filtered as child (child.route)}
			{@render parentNode(child, depth + 1)}
		{/each}
	{/if}
{/snippet}
