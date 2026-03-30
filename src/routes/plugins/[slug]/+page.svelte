<script lang="ts">
	import { page } from '$app/state';
	import { goto, beforeNavigate } from '$app/navigation';
	import { getPlugin, getPluginConfig, savePluginConfig, setPluginEnabled, getPluginReadme, getPluginChangelog, type PluginInfo } from '$lib/api/endpoints/gpm';
	import { getPluginBlueprint } from '$lib/api/endpoints/blueprints';
	import type { BlueprintSchema } from '$lib/api/endpoints/blueprints';
	import BlueprintForm from '$lib/components/blueprint/BlueprintForm.svelte';
	import MarkdownModal from '$lib/components/ui/MarkdownModal.svelte';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import {
		Save, ArrowLeft, Loader2, AlertCircle,
		Puzzle, ExternalLink, Power, PowerOff, BookOpen, FileText
	} from 'lucide-svelte';

	import { faIconClass, parseKeywords, parseDependencies } from '$lib/utils/gpm';

	const REDACTED = '********';

	const slug = $derived(page.params.slug ?? '');

	let plugin = $state<PluginInfo | null>(null);
	let blueprint = $state<BlueprintSchema | null>(null);
	let configData = $state<Record<string, unknown>>({});
	let originalJson = $state('{}');
	let etag = $state('');
	let loading = $state(true);
	let saving = $state(false);
	let toggling = $state(false);
	let error = $state('');

	let hasChanges = $derived(JSON.stringify(configData) !== originalJson);

	// Modal state for README / Changelog
	let modalOpen = $state(false);
	let modalTitle = $state('');
	let modalContent = $state('');
	let modalLoading = $state(false);

	async function showReadme() {
		modalLoading = true;
		modalTitle = `${plugin?.name ?? slug} — README`;
		modalContent = '';
		modalOpen = true;
		try {
			modalContent = await getPluginReadme(slug);
		} catch {
			modalContent = '*README not available.*';
		} finally {
			modalLoading = false;
		}
	}

	/**
	 * Preprocess Grav changelog markdown into clean HTML-friendly markdown.
	 *
	 * Grav changelogs use a special format:
	 *   1. [](#bugfix)      →  badge
	 *   1. [](#new)         →  badge
	 *   1. [](#improved)    →  badge
	 *       * item text     →  bullet item
	 */
	function formatChangelog(raw: string): string {
		const badgeColors: Record<string, string> = {
			new: 'background:#2563eb;color:white',
			improved: 'background:#f59e0b;color:white',
			bugfix: 'background:#ef4444;color:white',
		};
		const badgeLabels: Record<string, string> = {
			new: 'New',
			improved: 'Improved',
			bugfix: 'Bugfix',
		};

		return raw
			// Replace "1. [](#type)" lines with badge HTML
			.replace(/^\d+\.\s*\[]\(#(\w+)\)\s*$/gm, (_match, type: string) => {
				const color = badgeColors[type] ?? 'background:#6b7280;color:white';
				const label = badgeLabels[type] ?? type;
				return `<span style="${color};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;display:inline-block;margin-top:8px">${label}</span>\n`;
			})
			// Convert indented "* item" to flat bullets (remove extra nesting)
			.replace(/^ {4}\* /gm, '- ')
			.replace(/^\t\* /gm, '- ');
	}

	async function showChangelog() {
		modalLoading = true;
		modalTitle = `${plugin?.name ?? slug} — Changelog`;
		modalContent = '';
		modalOpen = true;
		try {
			const raw = await getPluginChangelog(slug);
			modalContent = formatChangelog(raw);
		} catch {
			modalContent = '*Changelog not available.*';
		} finally {
			modalLoading = false;
		}
	}

	async function loadPlugin() {
		loading = true;
		error = '';

		try {
			const [pluginResult, blueprintResult, configResult] = await Promise.all([
				getPlugin(slug),
				getPluginBlueprint(slug).catch(() => null),
				getPluginConfig(slug).catch(() => ({ data: {}, etag: '' })),
			]);

			plugin = pluginResult;
			blueprint = blueprintResult;
			configData = configResult.data;
			originalJson = JSON.stringify(configResult.data);
			etag = configResult.etag;
		} catch (err: unknown) {
			error = `Failed to load plugin '${slug}'.`;
		} finally {
			loading = false;
		}
	}

	function handleBlueprintChange(path: string, value: unknown) {
		const parts = path.split('.');
		const newData = { ...configData };
		let current: Record<string, unknown> = newData;

		for (let i = 0; i < parts.length - 1; i++) {
			const key = parts[i];
			if (typeof current[key] !== 'object' || current[key] === null) {
				current[key] = {};
			} else {
				current[key] = { ...(current[key] as Record<string, unknown>) };
			}
			current = current[key] as Record<string, unknown>;
		}
		current[parts[parts.length - 1]] = value;
		configData = newData;
	}

	function stripRedacted(obj: unknown): unknown {
		if (typeof obj === 'string') return obj === REDACTED ? undefined : obj;
		if (Array.isArray(obj)) return obj.map(stripRedacted);
		if (obj && typeof obj === 'object') {
			const result: Record<string, unknown> = {};
			for (const [key, value] of Object.entries(obj)) {
				const stripped = stripRedacted(value);
				if (stripped !== undefined) result[key] = stripped;
			}
			return result;
		}
		return obj;
	}

	async function handleSave() {
		saving = true;
		try {
			const cleaned = stripRedacted(configData) as Record<string, unknown>;
			await savePluginConfig(slug, cleaned, etag);

			// Refresh to get new ETag
			const fresh = await getPluginConfig(slug);
			configData = fresh.data;
			originalJson = JSON.stringify(fresh.data);
			etag = fresh.etag;

			toast.success(`${plugin?.name ?? slug} configuration saved`);
		} catch (err: unknown) {
			if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 409) {
				toast.error('Configuration was modified elsewhere. Please reload.');
			} else {
				toast.error('Failed to save configuration.');
			}
		} finally {
			saving = false;
		}
	}

	const PROTECTED_PLUGINS = new Set(['api', 'login']);

	async function toggleEnabled() {
		if (!plugin) return;
		if (plugin.enabled && PROTECTED_PLUGINS.has(plugin.slug)) {
			toast.error(`${plugin.name} cannot be disabled from admin-next — it would lock you out.`);
			return;
		}
		toggling = true;
		const newState = !plugin.enabled;
		try {
			await setPluginEnabled(slug, newState);
			plugin = { ...plugin, enabled: newState };
			// Reload config/blueprint since enabling may expose new fields
			if (newState) {
				const [bp, cfg] = await Promise.all([
					getPluginBlueprint(slug).catch(() => null),
					getPluginConfig(slug).catch(() => ({ data: {}, etag: '' })),
				]);
				blueprint = bp;
				configData = cfg.data;
				originalJson = JSON.stringify(cfg.data);
				etag = cfg.etag;
			}
			toast.success(`${plugin.name} ${newState ? 'enabled' : 'disabled'}`);
		} catch {
			toast.error(`Failed to ${newState ? 'enable' : 'disable'} ${plugin.name}`);
		} finally {
			toggling = false;
		}
	}

	// Keyboard shortcut: Cmd+S to save
	function handleKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 's') {
			e.preventDefault();
			if (hasChanges && !saving) handleSave();
		}
	}

	// Unsaved changes guard
	beforeNavigate(({ cancel }) => {
		if (hasChanges && !confirm('You have unsaved changes. Leave anyway?')) {
			cancel();
		}
	});

	$effect(() => {
		slug; // track
		loadPlugin();
	});
</script>

<svelte:head>
	<title>{plugin?.name ?? slug} — Plugins — Grav Admin</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="flex h-full flex-col">
	<!-- Header -->
	<div class="flex items-center justify-between border-b border-border px-6 py-3">
		<div class="flex items-center gap-3">
			<button
				type="button"
				class="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				onclick={() => goto('/plugins')}
			>
				<ArrowLeft size={16} />
			</button>
			{#if plugin}
				<div class="flex items-center gap-3">
					<div class="flex h-9 w-9 items-center justify-center rounded-lg {plugin.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}">
						{#if plugin.icon}
							<i class="{faIconClass(plugin.icon)} text-sm"></i>
						{:else}
							<Puzzle size={16} />
						{/if}
					</div>
					<div>
						<h1 class="text-lg font-semibold text-foreground">{plugin.name}</h1>
						<div class="flex items-center gap-2 text-xs text-muted-foreground">
							<span>v{plugin.version}</span>
							{#if plugin.author?.name}
								<span>by {plugin.author.name}</span>
							{/if}
						</div>
					</div>
				</div>
			{/if}
		</div>

		<div class="flex items-center gap-2">
			{#if plugin}
				<!-- Enable/disable toggle -->
				<Button
					variant={plugin.enabled ? 'outline' : 'default'}
					size="sm"
					onclick={toggleEnabled}
					disabled={toggling}
				>
					{#if toggling}
						<Loader2 size={14} class="mr-1.5 animate-spin" />
					{:else if plugin.enabled}
						<PowerOff size={14} class="mr-1.5" />
					{:else}
						<Power size={14} class="mr-1.5" />
					{/if}
					{plugin.enabled ? 'Disable' : 'Enable'}
				</Button>

				<!-- Save button -->
				<Button
					size="sm"
					onclick={handleSave}
					disabled={!hasChanges || saving}
				>
					{#if saving}
						<Loader2 size={14} class="mr-1.5 animate-spin" />
					{:else}
						<Save size={14} class="mr-1.5" />
					{/if}
					Save
				</Button>
			{/if}
		</div>
	</div>

	<!-- Content -->
	{#if loading}
		<div class="flex flex-1 items-center justify-center">
			<Loader2 size={24} class="animate-spin text-muted-foreground" />
		</div>
	{:else if error}
		<div class="flex flex-1 items-center justify-center">
			<div class="text-center">
				<AlertCircle size={32} class="mx-auto text-destructive" />
				<p class="mt-2 text-sm text-destructive">{error}</p>
				<Button variant="outline" size="sm" class="mt-3" onclick={() => goto('/plugins')}>
					Back to Plugins
				</Button>
			</div>
		</div>
	{:else if plugin}
		<div class="flex-1 overflow-y-auto">
			<div class="mx-auto max-w-4xl space-y-6 px-6 py-6">
				<!-- Plugin info card -->
				<div class="rounded-xl border border-border bg-card p-5">
					<div class="flex items-start gap-4">
						<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl {plugin.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}">
							{#if plugin.icon}
								<i class="{faIconClass(plugin.icon)} text-xl"></i>
							{:else}
								<Puzzle size={24} />
							{/if}
						</div>
						<div class="min-w-0 flex-1">
							{#if plugin.description}
								<p class="text-sm leading-relaxed text-muted-foreground">{plugin.description}</p>
							{/if}
							<div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
								{#if plugin.homepage}
									<a href={plugin.homepage} target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-primary hover:underline">
										Homepage <ExternalLink size={10} />
									</a>
								{/if}
								{#if plugin.author?.url}
									<a href={plugin.author.url} target="_blank" rel="noopener" class="inline-flex items-center gap-1 hover:text-foreground">
										{plugin.author.name} <ExternalLink size={10} />
									</a>
								{:else if plugin.author?.name}
									<span>{plugin.author.name}</span>
								{/if}
								<button type="button" class="inline-flex items-center gap-1 hover:text-foreground" onclick={showReadme}>
									<BookOpen size={10} /> README
								</button>
								<button type="button" class="inline-flex items-center gap-1 hover:text-foreground" onclick={showChangelog}>
									<FileText size={10} /> Changelog
								</button>
							</div>
							{#if parseKeywords(plugin.keywords).length}
								<div class="mt-2 flex flex-wrap gap-1">
									{#each parseKeywords(plugin.keywords) as kw}
										<span class="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{kw}</span>
									{/each}
								</div>
							{/if}
						</div>
					</div>
				</div>

				<!-- Configuration form -->
				{#if plugin.enabled && blueprint}
					<BlueprintForm
						fields={blueprint.fields}
						data={configData}
						onchange={handleBlueprintChange}
					/>
				{:else if !plugin.enabled}
					<div class="rounded-xl border border-dashed border-border p-8 text-center">
						<PowerOff size={32} class="mx-auto text-muted-foreground/40" />
						<p class="mt-3 text-sm text-muted-foreground">
							Plugin must be enabled to configure.
						</p>
						<Button variant="outline" size="sm" class="mt-3" onclick={toggleEnabled} disabled={toggling}>
							{#if toggling}
								<Loader2 size={14} class="mr-1.5 animate-spin" />
							{/if}
							Enable Plugin
						</Button>
					</div>
				{:else}
					<div class="rounded-xl border border-dashed border-border p-8 text-center">
						<p class="text-sm text-muted-foreground">
							No configuration options available for this plugin.
						</p>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<MarkdownModal
	open={modalOpen}
	title={modalTitle}
	content={modalLoading ? 'Loading...' : modalContent}
	onclose={() => { modalOpen = false; }}
/>
