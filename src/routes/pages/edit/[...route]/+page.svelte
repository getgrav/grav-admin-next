<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { getPage, updatePage, deletePage } from '$lib/api/endpoints/pages';
	import { getPageBlueprint } from '$lib/api/endpoints/blueprints';
	import type { PageDetail } from '$lib/api/endpoints/pages';
	import type { BlueprintSchema } from '$lib/api/endpoints/blueprints';
	import BlueprintForm from '$lib/components/blueprint/BlueprintForm.svelte';
	import {
		Save,
		Trash2,
		ArrowLeft,
		Eye,
		EyeOff,
		FileText,
		Settings,
		Code,
		Blocks,
		RefreshCw,
		Check,
		AlertCircle
	} from 'lucide-svelte';

	const route = $derived('/' + (page.params.route || ''));

	let pageData = $state<PageDetail | null>(null);
	let blueprint = $state<BlueprintSchema | null>(null);
	let loading = $state(true);
	let saving = $state(false);
	let error = $state('');
	let successMessage = $state('');

	// Editable fields
	let title = $state('');
	let content = $state('');
	let template = $state('');
	let published = $state(true);
	let visible = $state(true);
	let headerData = $state<Record<string, unknown>>({});
	let headerYaml = $state('');
	let activeTab = $state<'content' | 'blueprint' | 'options' | 'advanced'>('content');

	let hasChanges = $derived(
		pageData !== null && (
			title !== pageData.title ||
			content !== (pageData.content ?? '') ||
			template !== pageData.template ||
			published !== pageData.published ||
			visible !== pageData.visible
		)
	);

	async function loadPage() {
		loading = true;
		error = '';
		try {
			const data = await getPage(route, { render: false, translations: true });
			pageData = data;
			title = data.title;
			content = data.content ?? '';
			template = data.template;
			published = data.published;
			visible = data.visible;
			headerData = { header: data.header ?? {} };
			headerYaml = JSON.stringify(data.header ?? {}, null, 2);

			// Load blueprint for the page template
			try {
				blueprint = await getPageBlueprint(data.template);
			} catch {
				blueprint = null; // Non-critical — editor still works without blueprint
			}
		} catch (err: unknown) {
			if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404) {
				error = `Page not found: ${route}`;
			} else {
				error = 'Failed to load page';
			}
		} finally {
			loading = false;
		}
	}

	function handleBlueprintChange(path: string, value: unknown) {
		// Update headerData with the change
		headerData = { ...headerData };
	}

	async function handleSave() {
		if (!pageData) return;
		saving = true;
		error = '';
		successMessage = '';

		try {
			const body: Record<string, unknown> = {};
			if (title !== pageData.title) body.title = title;
			if (content !== (pageData.content ?? '')) body.content = content;
			if (template !== pageData.template) body.template = template;
			if (published !== pageData.published) body.published = published;
			if (visible !== pageData.visible) body.visible = visible;

			if (Object.keys(body).length === 0) {
				successMessage = 'No changes to save';
				setTimeout(() => successMessage = '', 2000);
				return;
			}

			const updated = await updatePage(route, body);
			pageData = updated;
			content = updated.content ?? content;
			successMessage = 'Page saved successfully';
			setTimeout(() => successMessage = '', 3000);
		} catch (err: unknown) {
			if (err && typeof err === 'object' && 'message' in err) {
				error = (err as { message: string }).message;
			} else {
				error = 'Failed to save page';
			}
		} finally {
			saving = false;
		}
	}

	async function handleDelete() {
		if (!pageData) return;
		if (!confirm(`Delete "${pageData.title}" at ${route}? This cannot be undone.`)) return;
		try {
			await deletePage(route, { children: true });
			goto('/pages');
		} catch {
			error = 'Failed to delete page';
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 's') {
			e.preventDefault();
			handleSave();
		}
	}

	$effect(() => {
		loadPage();
	});
</script>

<svelte:head>
	<title>{title || 'Edit Page'} — Grav Admin</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="mx-auto max-w-6xl space-y-4">
	<!-- Top bar -->
	<div class="flex items-center justify-between gap-4">
		<div class="flex min-w-0 items-center gap-3">
			<button class="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground" onclick={() => goto('/pages')} title="Back to pages">
				<ArrowLeft size={16} />
			</button>
			<div class="min-w-0">
				{#if loading}
					<div class="h-6 w-48 animate-pulse rounded bg-muted"></div>
				{:else}
					<h1 class="truncate text-lg font-semibold text-foreground">{title || 'Untitled'}</h1>
					<p class="truncate text-xs text-muted-foreground">{route}</p>
				{/if}
			</div>
		</div>

		<div class="flex shrink-0 items-center gap-2">
			{#if hasChanges}
				<span class="text-xs text-amber-500">Unsaved changes</span>
			{/if}
			<button
				class="inline-flex items-center rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 shadow-sm transition-colors hover:bg-red-100 dark:border-red-800/50 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40 gap-1"
				onclick={handleDelete}
				disabled={loading}
			>
				<Trash2 size={14} />
				Delete
			</button>
			<button
				class="inline-flex items-center rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 gap-1"
				onclick={handleSave}
				disabled={saving || loading}
			>
				{#if saving}
					<RefreshCw size={14} class="animate-spin" />
					Saving...
				{:else}
					<Save size={14} />
					Save
				{/if}
			</button>
		</div>
	</div>

	<!-- Messages -->
	{#if error}
		<div class="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950/30 dark:text-red-300">
			<AlertCircle size={16} />
			{error}
		</div>
	{/if}
	{#if successMessage}
		<div class="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-300">
			<Check size={16} />
			{successMessage}
		</div>
	{/if}

	{#if loading}
		<div class="py-20 text-center text-sm text-muted-foreground">Loading page...</div>
	{:else if pageData}
		<div class="grid gap-4 lg:grid-cols-[1fr_300px]">
			<!-- Main editor area -->
			<div class="space-y-4">
				<!-- Title -->
				<div class="rounded-lg border border-border bg-card p-4">
					<input
						type="text"
						class="flex h-11 w-full rounded-md border border-input bg-transparent px-3 py-1 text-lg font-semibold shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
						placeholder="Page Title"
						bind:value={title}
					/>
				</div>

				<!-- Tab bar -->
				<div class="flex gap-1 border-b border-border">
					<button
						class="flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors {activeTab === 'content' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}"
						onclick={() => activeTab = 'content'}
					>
						<FileText size={14} />
						Content
					</button>
					{#if blueprint}
						<button
							class="flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors {activeTab === 'blueprint' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}"
							onclick={() => activeTab = 'blueprint'}
						>
							<Blocks size={14} />
							Blueprint
						</button>
					{/if}
					<button
						class="flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors {activeTab === 'options' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}"
						onclick={() => activeTab = 'options'}
					>
						<Settings size={14} />
						Options
					</button>
					<button
						class="flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors {activeTab === 'advanced' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}"
						onclick={() => activeTab = 'advanced'}
					>
						<Code size={14} />
						Advanced
					</button>
				</div>

				<!-- Tab content -->
				{#if activeTab === 'blueprint' && blueprint}
					<div class="rounded-lg border border-border bg-card p-4">
						<BlueprintForm
							fields={blueprint.fields}
							data={headerData}
							onchange={handleBlueprintChange}
						/>
					</div>
				{:else if activeTab === 'content'}
					<div class="rounded-lg border border-border bg-card">
						<textarea
							class="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono"
							rows={25}
							placeholder="Write your markdown content here..."
							bind:value={content}
							style="resize: vertical; border: none; border-radius: inherit;"
						></textarea>
					</div>
				{:else if activeTab === 'options'}
					<div class="space-y-4 rounded-lg border border-border bg-card p-4">
						<label class="label">
							<span class="text-sm font-medium text-foreground">Template</span>
							<input type="text" class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" bind:value={template} />
						</label>

						{#if pageData.taxonomy && Object.keys(pageData.taxonomy).length > 0}
							<div>
								<span class="text-sm font-medium text-foreground">Taxonomy</span>
								<div class="mt-2 flex flex-wrap gap-2">
									{#each Object.entries(pageData.taxonomy) as [type, values]}
										{#each values as val}
											<span class="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{type}: {val}</span>
										{/each}
									{/each}
								</div>
							</div>
						{/if}

						{#if pageData.translated_languages || pageData.untranslated_languages}
							<div>
								<span class="text-sm font-medium text-foreground">Translations</span>
								<div class="mt-2 flex gap-2">
									{#each Object.keys(pageData.translated_languages ?? {}) as lang}
										<span class="inline-flex items-center rounded-md bg-emerald-600/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">{lang}</span>
									{/each}
									{#each Object.keys(pageData.untranslated_languages ?? {}) as lang}
										<span class="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{lang} (missing)</span>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				{:else if activeTab === 'advanced'}
					<div class="rounded-lg border border-border bg-card">
						<div class="p-4 text-sm font-medium text-foreground">Page Header (JSON)</div>
						<textarea
							class="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono"
							rows={15}
							bind:value={headerYaml}
							style="resize: vertical; border: none; border-top: 1px solid hsl(var(--border)); border-radius: 0 0 0.5rem 0.5rem;"
						></textarea>
					</div>
				{/if}
			</div>

			<!-- Sidebar -->
			<div class="space-y-4">
				<!-- Publish settings -->
				<div class="rounded-lg border border-border bg-card p-4">
					<h3 class="mb-3 text-sm font-semibold text-foreground">Publishing</h3>
					<div class="space-y-3">
						<label class="flex cursor-pointer items-center justify-between">
							<span class="flex items-center gap-2 text-sm text-muted-foreground">
								{#if published}
									<Eye size={14} class="text-emerald-500" />
								{:else}
									<EyeOff size={14} />
								{/if}
								Published
							</span>
							<input type="checkbox" class="switch" bind:checked={published} />
						</label>

						<label class="flex cursor-pointer items-center justify-between">
							<span class="flex items-center gap-2 text-sm text-muted-foreground">
								{#if visible}
									<Eye size={14} class="text-primary" />
								{:else}
									<EyeOff size={14} />
								{/if}
								Visible in nav
							</span>
							<input type="checkbox" class="switch" bind:checked={visible} />
						</label>
					</div>
				</div>

				<!-- Page info -->
				<div class="rounded-lg border border-border bg-card p-4">
					<h3 class="mb-3 text-sm font-semibold text-foreground">Info</h3>
					<dl class="space-y-2 text-sm">
						<div class="flex justify-between">
							<dt class="text-muted-foreground">Route</dt>
							<dd class="max-w-[150px] truncate font-medium text-foreground" title={pageData.route}>{pageData.route}</dd>
						</div>
						<div class="flex justify-between">
							<dt class="text-muted-foreground">Slug</dt>
							<dd class="font-medium text-foreground">{pageData.slug}</dd>
						</div>
						<div class="flex justify-between">
							<dt class="text-muted-foreground">Template</dt>
							<dd class="font-medium text-foreground">{pageData.template}</dd>
						</div>
						{#if pageData.language}
							<div class="flex justify-between">
								<dt class="text-muted-foreground">Language</dt>
								<dd class="font-medium text-foreground">{pageData.language}</dd>
							</div>
						{/if}
						<div class="flex justify-between">
							<dt class="text-muted-foreground">Modified</dt>
							<dd class="font-medium text-foreground">{new Date(pageData.modified).toLocaleString()}</dd>
						</div>
					</dl>
				</div>

				<!-- Media -->
				{#if pageData.media && pageData.media.length > 0}
					<div class="rounded-lg border border-border bg-card p-4">
						<h3 class="mb-3 text-sm font-semibold text-foreground">Media ({pageData.media.length})</h3>
						<ul class="space-y-1">
							{#each pageData.media as m}
								<li class="flex items-center justify-between text-xs">
									<span class="truncate text-foreground">{m.filename}</span>
									<span class="text-muted-foreground">{(m.size / 1024).toFixed(0)}KB</span>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
