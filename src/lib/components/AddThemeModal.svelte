<script lang="ts">
	import { getRepositoryThemes, installTheme, type RepositoryTheme } from '$lib/api/endpoints/gpm';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import { Search, X, Palette, ExternalLink, Download, Loader2, ShoppingCart, BadgeCheck } from 'lucide-svelte';
	import { faIconClass, parseKeywords, parseDependencies, isFirstParty, descriptionText } from '$lib/utils/gpm';

	interface Props {
		open: boolean;
		onclose: () => void;
		oninstalled: () => void;
	}

	let { open, onclose, oninstalled }: Props = $props();

	let allThemes = $state<RepositoryTheme[]>([]);
	let loading = $state(false);
	let search = $state('');
	let selectedSlug = $state<string | null>(null);
	let installingSlug = $state<string | null>(null);

	const available = $derived.by(() => {
		let list = allThemes.filter((t) => !t.installed);

		if (search) {
			const q = search.toLowerCase();
			list = list.filter(
				(t) =>
					t.name.toLowerCase().includes(q) ||
					t.slug.toLowerCase().includes(q) ||
					(t.description ?? '').toLowerCase().includes(q) ||
					(t.author?.name ?? '').toLowerCase().includes(q) ||
					parseKeywords(t.keywords).some((k) => k.toLowerCase().includes(q)) ||
					(t.premium && 'premium'.includes(q)),
			);
		}

		list.sort((a, b) => a.name.localeCompare(b.name));
		return list;
	});

	const selectedTheme = $derived(
		selectedSlug ? available.find((t) => t.slug === selectedSlug) ?? null : null,
	);

	function needsPurchase(theme: RepositoryTheme): boolean {
		return !!theme.premium && !theme.licensed;
	}

	function openPurchase(theme: RepositoryTheme) {
		if (theme.purchase_url) {
			window.open(theme.purchase_url, '_blank', 'noopener');
		}
	}

	async function loadThemes() {
		loading = true;
		try {
			allThemes = await getRepositoryThemes();
			const first = allThemes.find((t) => !t.installed);
			if (first) selectedSlug = first.slug;
		} catch {
			toast.error('Failed to load available themes from GPM');
		} finally {
			loading = false;
		}
	}

	async function handleInstall(slug: string) {
		installingSlug = slug;
		try {
			const result = await installTheme(slug);
			const idx = allThemes.findIndex((t) => t.slug === slug);
			if (idx !== -1) {
				allThemes[idx] = { ...allThemes[idx], installed: true };
				allThemes = [...allThemes];
			}
			if (selectedSlug === slug) {
				const next = available.find((t) => t.slug !== slug);
				selectedSlug = next?.slug ?? null;
			}
			// Dependencies are typically plugins — emit one toast each, then the main theme
			for (const depSlug of result.dependencies ?? []) {
				toast.success(`Plugin '${depSlug}' installed (dependency)`);
			}
			toast.success(`Theme '${allThemes.find((t) => t.slug === slug)?.name ?? slug}' installed`);
			oninstalled();
		} catch {
			toast.error(`Failed to install '${slug}'`);
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

	$effect(() => {
		if (open) {
			search = '';
			selectedSlug = null;
			loadThemes();
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
					<h2 class="text-lg font-semibold text-foreground">Add Theme</h2>
					{#if !loading}
						<p class="mt-0.5 text-xs text-muted-foreground">{available.length} available</p>
					{/if}
				</div>
				<div class="flex items-center gap-2">
					{#if selectedTheme}
						{#if needsPurchase(selectedTheme)}
							<Button size="sm" variant="destructive" onclick={() => openPurchase(selectedTheme)}>
								<ShoppingCart size={14} class="mr-1.5" />
								Buy
							</Button>
						{:else}
							<Button size="sm" onclick={() => handleInstall(selectedTheme.slug)} disabled={installingSlug === selectedTheme.slug}>
								{#if installingSlug === selectedTheme.slug}
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
							placeholder="Filter themes..."
							bind:value={search}
						/>
					</div>
				</div>

				<!-- Main content: list + detail -->
				<div class="flex flex-1 overflow-hidden">
					<!-- Theme list (left column) -->
					<div class="w-full overflow-y-auto border-r border-border lg:w-[360px] xl:w-[400px]">
						{#each available as theme (theme.slug)}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<div
								class="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors
									{selectedSlug === theme.slug ? 'bg-accent' : 'hover:bg-muted/50'}"
								onclick={() => (selectedSlug = theme.slug)}
							>
								<!-- Thumbnail -->
								<div class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
									{#if theme.screenshot}
										<img src={theme.screenshot} alt={theme.name} class="h-full w-full object-cover" />
									{:else if theme.icon}
										<i class="{faIconClass(theme.icon)} text-sm text-muted-foreground"></i>
									{:else}
										<Palette size={16} class="text-muted-foreground" />
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
									</div>
									<p class="truncate text-xs text-muted-foreground">{descriptionText(theme)}</p>
								</div>

								<!-- Install / Buy button -->
								{#if needsPurchase(theme)}
									<Button
										variant="outline"
										size="sm"
										onclick={(e: MouseEvent) => { e.stopPropagation(); openPurchase(theme); }}
										class="shrink-0"
									>
										<ShoppingCart size={12} />
									</Button>
								{:else}
									<Button
										variant="outline"
										size="sm"
										onclick={(e: MouseEvent) => { e.stopPropagation(); handleInstall(theme.slug); }}
										disabled={installingSlug === theme.slug}
										class="shrink-0"
									>
										{#if installingSlug === theme.slug}
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
								{search ? 'No themes match your filter' : 'All themes are already installed'}
							</div>
						{/if}
					</div>

					<!-- Detail panel (right column) -->
					<div class="hidden flex-1 overflow-y-auto lg:block">
						{#if selectedTheme}
							<div class="p-6">
								<!-- Screenshot -->
								{#if selectedTheme.screenshot}
									<div class="mx-auto mb-5 max-w-[500px] overflow-hidden rounded-xl border border-border">
										<img src={selectedTheme.screenshot} alt={selectedTheme.name} class="w-full" />
									</div>
								{/if}

								<!-- Theme header -->
								<div>
									<div class="flex items-center gap-1.5">
										<h3 class="text-lg font-semibold text-foreground">{selectedTheme.name}</h3>
										{#if isFirstParty(selectedTheme.author)}
											<BadgeCheck size={18} class="shrink-0 text-purple-500" />
										{/if}
										{#if selectedTheme.premium}
											<span class="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">Premium</span>
										{/if}
									</div>
									<div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
										<span>v{selectedTheme.version}</span>
										{#if selectedTheme.author?.name}
											<span>by {selectedTheme.author.name}</span>
										{/if}
									</div>
								</div>

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
										<dt class="text-xs font-medium text-muted-foreground">Version</dt>
										<dd class="mt-0.5 font-mono text-xs text-foreground">{selectedTheme.version}</dd>
									</div>

									<div>
										<dt class="text-xs font-medium text-muted-foreground">Slug</dt>
										<dd class="mt-0.5 font-mono text-xs text-foreground">{selectedTheme.slug}</dd>
									</div>
								</div>

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
	</div>
{/if}
