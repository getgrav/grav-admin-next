<script lang="ts">
	import { goto } from '$app/navigation';
	import { getInstalledPlugins, setPluginEnabled, checkUpdates, type PluginInfo } from '$lib/api/endpoints/gpm';
	import { Button } from '$lib/components/ui/button';
	import AddPluginModal from '$lib/components/AddPluginModal.svelte';
	import { toast } from 'svelte-sonner';
	import { Search, Puzzle, ExternalLink, ArrowUpCircle, ChevronRight, Loader2, Plus, RefreshCw, BadgeCheck } from 'lucide-svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { faIconClass, parseKeywords, parseDependencies, isFirstParty } from '$lib/utils/gpm';

	const translateLabel = i18n.tMaybe;

	let plugins = $state<PluginInfo[]>([]);
	let loading = $state(true);
	let search = $state('');
	let sortBy = $state<'name' | 'author' | 'enabled'>('name');
	let selectedSlug = $state<string | null>(null);
	let togglingSlug = $state<string | null>(null);
	let addModalOpen = $state(false);
	let checkingUpdates = $state(false);

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
					return a.name.localeCompare(b.name);
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
			// Auto-select first if none selected
			if (!selectedSlug && plugins.length > 0) {
				selectedSlug = plugins[0].slug;
			}
		} catch (err) {
			toast.error('Failed to load plugins');
		} finally {
			loading = false;
		}
	}

	// Plugins that cannot be disabled from an API-based admin
	const PROTECTED_PLUGINS = new Set(['api', 'login']);

	async function toggleEnabled(plugin: PluginInfo, e: Event) {
		e.stopPropagation();
		if (plugin.enabled && PROTECTED_PLUGINS.has(plugin.slug)) {
			toast.error(`${plugin.name} cannot be disabled from admin-next — it would lock you out.`);
			return;
		}
		togglingSlug = plugin.slug;
		const newState = !plugin.enabled;
		try {
			await setPluginEnabled(plugin.slug, newState);
			plugin.enabled = newState;
			plugins = [...plugins]; // trigger reactivity
			toast.success(`${plugin.name} ${newState ? 'enabled' : 'disabled'}`);
		} catch {
			toast.error(`Failed to ${newState ? 'enable' : 'disable'} ${plugin.name}`);
		} finally {
			togglingSlug = null;
		}
	}

	function selectPlugin(slug: string) {
		selectedSlug = slug;
	}

	function openPluginConfig(slug: string) {
		goto(`/plugins/${slug}`);
	}

	async function handleCheckUpdates() {
		checkingUpdates = true;
		try {
			const result = await checkUpdates(true);
			toast.success(`GPM refreshed — ${result.total} update${result.total !== 1 ? 's' : ''} available`);
			await loadPlugins();
		} catch {
			toast.error('Failed to check for updates');
		} finally {
			checkingUpdates = false;
		}
	}

	function handlePluginInstalled() {
		loadPlugins();
	}

	$effect(() => {
		loadPlugins();
	});
</script>

<svelte:head>
	<title>Plugins — Grav Admin</title>
</svelte:head>

<div class="flex h-full flex-col">
	<!-- Header -->
	<div class="flex items-center justify-between border-b border-border px-6 py-4">
		<div>
			<h1 class="text-xl font-semibold text-foreground">Plugins</h1>
			{#if !loading}
				<p class="mt-0.5 text-xs text-muted-foreground">{plugins.length} installed</p>
			{/if}
		</div>
		<div class="flex items-center gap-2">
			<Button variant="outline" size="sm" onclick={handleCheckUpdates} disabled={checkingUpdates}>
				<RefreshCw size={13} class={checkingUpdates ? 'animate-spin' : ''} />
				Check Updates
			</Button>
			<Button size="sm" onclick={() => (addModalOpen = true)}>
				<Plus size={14} />
				Add
			</Button>
		</div>
	</div>

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
					placeholder="Search plugins..."
					bind:value={search}
				/>
			</div>
			<select
				class="h-8 rounded-md border border-input bg-muted/50 px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
				bind:value={sortBy}
			>
				<option value="name">Name</option>
				<option value="author">Author</option>
				<option value="enabled">Status</option>
			</select>
		</div>

		<!-- Main content: list + detail panel -->
		<div class="flex flex-1 overflow-hidden">
			<!-- Plugin list -->
			<div class="w-full overflow-y-auto border-r border-border lg:w-[400px] xl:w-[440px]">
				{#each filtered as plugin (plugin.slug)}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->					<div
						class="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors
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
								{#if plugin.updatable}
									<ArrowUpCircle size={12} class="shrink-0 text-amber-500" />
								{/if}
							</div>
							<p class="truncate text-xs text-muted-foreground">{plugin.description ?? ''}</p>
						</div>

						<!-- Enable toggle -->
						<button
							type="button"
							class="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors
								{plugin.enabled
									? 'bg-green-500/15 text-green-600 hover:bg-green-500/25 dark:text-green-400'
									: 'bg-muted text-muted-foreground hover:bg-muted/80'}"
							onclick={(e) => toggleEnabled(plugin, e)}
							disabled={togglingSlug === plugin.slug}
						>
							{#if togglingSlug === plugin.slug}
								<Loader2 size={10} class="inline animate-spin" />
							{:else}
								{plugin.enabled ? 'Enabled' : 'Disabled'}
							{/if}
						</button>
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
								</div>
								<div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
									<span>v{selectedPlugin.version}</span>
									{#if selectedPlugin.author?.name}
										<span>by {selectedPlugin.author.name}</span>
									{/if}
									{#if selectedPlugin.updatable}
										<span class="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-600 dark:text-amber-400">
											Update available: v{selectedPlugin.available_version}
										</span>
									{/if}
								</div>
							</div>
							<button
								type="button"
								class="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
								onclick={() => openPluginConfig(selectedPlugin.slug)}
							>
								Configure
								<ChevronRight size={14} />
							</button>
						</div>

						<!-- Description -->
						{#if selectedPlugin.description}
							<p class="mt-4 text-sm leading-relaxed text-muted-foreground">
								{selectedPlugin.description}
							</p>
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
								<dt class="text-xs font-medium text-muted-foreground">Status</dt>
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

<AddPluginModal
	open={addModalOpen}
	onclose={() => (addModalOpen = false)}
	oninstalled={handlePluginInstalled}
/>
