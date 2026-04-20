<script lang="ts">
	import { getRepositoryPlugins, installPlugin, type RepositoryPlugin } from '$lib/api/endpoints/gpm';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import { Search, X, Puzzle, ExternalLink, Download, Loader2, Check, ShoppingCart, BadgeCheck } from 'lucide-svelte';
	import { faIconClass, parseKeywords, parseDependencies, isFirstParty, descriptionText } from '$lib/utils/gpm';

	interface Props {
		open: boolean;
		onclose: () => void;
		oninstalled: () => void;
		initialSearch?: string;
	}

	let { open, onclose, oninstalled, initialSearch = '' }: Props = $props();

	let allPlugins = $state<RepositoryPlugin[]>([]);
	let loading = $state(false);
	let search = $state(initialSearch);

	// Update search when initialSearch changes (e.g., navigated with ?install=slug)
	$effect(() => {
		if (initialSearch) search = initialSearch;
	});
	let selectedSlug = $state<string | null>(null);
	let installingSlug = $state<string | null>(null);

	// Only show plugins that are NOT already installed
	const available = $derived.by(() => {
		let list = allPlugins.filter((p) => !p.installed);

		if (search) {
			const q = search.toLowerCase();
			list = list.filter(
				(p) =>
					p.name.toLowerCase().includes(q) ||
					p.slug.toLowerCase().includes(q) ||
					(p.description ?? '').toLowerCase().includes(q) ||
					(p.author?.name ?? '').toLowerCase().includes(q) ||
					parseKeywords(p.keywords).some((k) => k.toLowerCase().includes(q)) ||
					(p.premium && 'premium'.includes(q)),
			);
		}

		list.sort((a, b) => a.name.localeCompare(b.name));
		return list;
	});

	const selectedPlugin = $derived(
		selectedSlug ? available.find((p) => p.slug === selectedSlug) ?? null : null,
	);

	async function loadPlugins() {
		loading = true;
		try {
			allPlugins = await getRepositoryPlugins();
			// Auto-select matching plugin if initialSearch is a slug, otherwise first available
			const match = initialSearch ? allPlugins.find((p) => !p.installed && p.slug === initialSearch) : null;
			const first = match ?? allPlugins.find((p) => !p.installed);
			if (first) selectedSlug = first.slug;
		} catch {
			toast.error('Failed to load available plugins from GPM');
		} finally {
			loading = false;
		}
	}

	function needsPurchase(plugin: RepositoryPlugin): boolean {
		return !!plugin.premium && !plugin.licensed;
	}

	function openPurchase(plugin: RepositoryPlugin) {
		if (plugin.purchase_url) {
			window.open(plugin.purchase_url, '_blank', 'noopener');
		}
	}

	async function handleInstall(slug: string) {
		installingSlug = slug;
		try {
			const result = await installPlugin(slug);
			// Mark main package + dependencies as installed locally
			const installedSlugs = [slug, ...(result.dependencies ?? [])];
			for (const s of installedSlugs) {
				const idx = allPlugins.findIndex((p) => p.slug === s);
				if (idx !== -1) {
					allPlugins[idx] = { ...allPlugins[idx], installed: true };
				}
			}
			allPlugins = [...allPlugins];
			// Select next available or clear selection
			if (selectedSlug === slug) {
				const next = available.find((p) => p.slug !== slug);
				selectedSlug = next?.slug ?? null;
			}
			// One toast per installed package (dependencies first, then the main one)
			for (const depSlug of result.dependencies ?? []) {
				const name = allPlugins.find((p) => p.slug === depSlug)?.name ?? depSlug;
				toast.success(`Plugin '${name}' installed (dependency)`);
			}
			const mainName = allPlugins.find((p) => p.slug === slug)?.name ?? slug;
			toast.success(`Plugin '${mainName}' installed`);
			oninstalled();
		} catch (err: unknown) {
			const detail = err instanceof Error ? err.message : String(err);
			toast.error(`Failed to install '${slug}': ${detail}`);
		} finally {
			installingSlug = null;
		}
	}

	function handleBackdrop(e: MouseEvent) {
		if (e.target === e.currentTarget) onclose();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}

	// Load data when modal opens
	$effect(() => {
		if (open) {
			search = initialSearch || '';
			selectedSlug = null;
			loadPlugins();
		}
	});
</script>

<svelte:window onkeydown={open ? handleKeydown : undefined} />

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/75 p-4 backdrop-blur-sm sm:p-8"
		onclick={handleBackdrop}
	>
		<div class="flex h-[85vh] w-full max-w-5xl flex-col rounded-xl border border-border bg-card shadow-2xl">
			<!-- Header -->
			<div class="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
				<div>
					<h2 class="text-lg font-semibold text-foreground">Add Plugin</h2>
					{#if !loading}
						<p class="mt-0.5 text-xs text-muted-foreground">{available.length} available</p>
					{/if}
				</div>
				<div class="flex items-center gap-2">
					{#if selectedPlugin}
						{#if needsPurchase(selectedPlugin)}
							<Button size="sm" variant="destructive" onclick={() => openPurchase(selectedPlugin)}>
								<ShoppingCart size={14} class="mr-1.5" />
								Buy
							</Button>
						{:else}
							<Button size="sm" onclick={() => handleInstall(selectedPlugin.slug)} disabled={installingSlug === selectedPlugin.slug}>
								{#if installingSlug === selectedPlugin.slug}
									<Loader2 size={14} class="mr-1.5 animate-spin" />
									Installing...
								{:else}
									<Download size={14} class="mr-1.5" />
									Install
								{/if}
							</Button>
						{/if}
					{/if}
					<button
						type="button"
						class="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						onclick={onclose}
					>
						<X size={16} />
					</button>
				</div>
			</div>

			{#if loading}
				<div class="flex flex-1 items-center justify-center">
					<Loader2 size={24} class="animate-spin text-muted-foreground" />
				</div>
			{:else}
				<!-- Search bar -->
				<div class="shrink-0 border-b border-border px-4 py-2">
					<div class="relative">
						<Search size={14} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
						<input
							type="text"
							class="h-8 w-full rounded-md border border-input bg-muted/50 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
							placeholder="Filter plugins..."
							bind:value={search}
						/>
					</div>
				</div>

				<!-- Main content: list + detail -->
				<div class="flex flex-1 overflow-hidden">
					<!-- Plugin list (left column) -->
					<div class="w-full overflow-y-auto border-r border-border lg:w-[360px] xl:w-[400px]">
						{#each available as plugin (plugin.slug)}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<div
								class="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors
									{selectedSlug === plugin.slug ? 'bg-accent' : 'hover:bg-muted/50'}"
								onclick={() => (selectedSlug = plugin.slug)}
							>
								<!-- Icon -->
								<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
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
											<span class="shrink-0 rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400">Premium</span>
										{/if}
									</div>
									<p class="truncate text-xs text-muted-foreground">{descriptionText(plugin)}</p>
								</div>

								<!-- Install / Buy button (inline) -->
								{#if needsPurchase(plugin)}
									<Button
										variant="outline"
										size="sm"
										onclick={(e: MouseEvent) => { e.stopPropagation(); openPurchase(plugin); }}
										class="shrink-0"
									>
										<ShoppingCart size={12} />
									</Button>
								{:else}
									<Button
										variant="outline"
										size="sm"
										onclick={(e: MouseEvent) => { e.stopPropagation(); handleInstall(plugin.slug); }}
										disabled={installingSlug === plugin.slug}
										class="shrink-0"
									>
										{#if installingSlug === plugin.slug}
											<Loader2 size={12} class="animate-spin" />
										{:else}
											<Download size={12} />
										{/if}
									</Button>
								{/if}
							</div>
						{/each}

						{#if available.length === 0}
							<div class="px-4 py-8 text-center text-sm text-muted-foreground">
								{search ? 'No plugins match your filter' : 'All plugins are already installed'}
							</div>
						{/if}
					</div>

					<!-- Detail panel (right column) -->
					<div class="hidden flex-1 overflow-y-auto lg:block">
						{#if selectedPlugin}
							<div class="p-6">
								<!-- Plugin header -->
								<div class="flex items-start gap-4">
									<div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
										{#if selectedPlugin.icon}
											<i class="{faIconClass(selectedPlugin.icon)} text-2xl"></i>
										{:else}
											<Puzzle size={28} />
										{/if}
									</div>
									<div class="min-w-0 flex-1">
										<div class="flex items-center gap-1.5">
											<h3 class="text-lg font-semibold text-foreground">{selectedPlugin.name}</h3>
											{#if isFirstParty(selectedPlugin.author)}
												<BadgeCheck size={18} class="shrink-0 text-purple-500" />
											{/if}
											{#if selectedPlugin.premium}
												<span class="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">Premium</span>
											{/if}
										</div>
										<div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
											<span>v{selectedPlugin.version}</span>
											{#if selectedPlugin.author?.name}
												<span>by {selectedPlugin.author.name}</span>
											{/if}
										</div>
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

								<!-- Metadata grid -->
								<div class="mt-6 grid grid-cols-2 gap-4">
									{#if selectedPlugin.author?.name}
										<div>
											<dt class="text-xs font-medium text-muted-foreground">Author</dt>
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
											<dt class="text-xs font-medium text-muted-foreground">Homepage</dt>
											<dd class="mt-0.5 text-sm">
												<a href={selectedPlugin.homepage} target="_blank" rel="noopener" class="text-primary hover:underline">
													Visit
													<ExternalLink size={10} class="inline" />
												</a>
											</dd>
										</div>
									{/if}

									<div>
										<dt class="text-xs font-medium text-muted-foreground">Version</dt>
										<dd class="mt-0.5 font-mono text-xs text-foreground">{selectedPlugin.version}</dd>
									</div>

									<div>
										<dt class="text-xs font-medium text-muted-foreground">Slug</dt>
										<dd class="mt-0.5 font-mono text-xs text-foreground">{selectedPlugin.slug}</dd>
									</div>
								</div>

								<!-- Keywords -->
								{#if parseKeywords(selectedPlugin.keywords).length}
									<div class="mt-4">
										<dt class="text-xs font-medium text-muted-foreground">Keywords</dt>
										<dd class="mt-1.5 flex flex-wrap gap-1.5">
											{#each parseKeywords(selectedPlugin.keywords) as kw}
												<span class="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{kw}</span>
											{/each}
										</dd>
									</div>
								{/if}

								<!-- Dependencies -->
								{#if parseDependencies(selectedPlugin.dependencies).length}
									<div class="mt-4">
										<dt class="text-xs font-medium text-muted-foreground">Dependencies</dt>
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
								Select a plugin to view details
							</div>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}
