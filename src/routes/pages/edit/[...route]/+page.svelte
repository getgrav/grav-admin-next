<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { setContext } from 'svelte';
	import { getPage, updatePage, deletePage } from '$lib/api/endpoints/pages';
	import { getPageBlueprint } from '$lib/api/endpoints/blueprints';
	import type { PageDetail } from '$lib/api/endpoints/pages';
	import type { BlueprintSchema } from '$lib/api/endpoints/blueprints';
	import BlueprintForm from '$lib/components/blueprint/BlueprintForm.svelte';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import {
		Save, Trash2, ArrowLeft, Eye, EyeOff, Code,
		RefreshCw, AlertCircle, ChevronDown, Loader2
	} from 'lucide-svelte';
	import MarkdownEditor from '$lib/components/editors/MarkdownEditor.svelte';
	import PageMedia from '$lib/components/media/PageMedia.svelte';

	const route = $derived('/' + (page.params.route || ''));

	// Provide page route to child components (used by PageMedia field, etc.)
	setContext('pageRoute', () => route);

	let pageData = $state<PageDetail | null>(null);
	let blueprint = $state<BlueprintSchema | null>(null);
	let loading = $state(true);
	let saving = $state(false);
	let error = $state('');
	let showRawEditor = $state(false);

	// Editable fields
	let title = $state('');
	let content = $state('');
	let template = $state('');
	let published = $state(true);
	let visible = $state(true);
	let headerData = $state<Record<string, unknown>>({});
	let headerChanges = $state<Record<string, unknown>>({});
	let headerYaml = $state('');

	let hasChanges = $derived(
		pageData !== null && (
			title !== pageData.title ||
			content !== (pageData.content ?? '') ||
			template !== pageData.template ||
			published !== pageData.published ||
			visible !== pageData.visible ||
			Object.keys(headerChanges).length > 0
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
			headerData = { header: { ...data.header ?? {}, title: data.title }, content: data.content ?? '' };
			headerYaml = JSON.stringify(data.header ?? {}, null, 2);

			// Load blueprint for the page template (falls back to default on API side)
			try {
				blueprint = await getPageBlueprint(data.template);
			} catch {
				blueprint = null;
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
		// Sync special fields back to their state variables
		if (path === 'content') {
			content = value as string;
		} else if (path === 'header.title') {
			title = value as string;
		}

		// Track header field changes for save
		if (path.startsWith('header.')) {
			const headerPath = path.slice(7); // Remove 'header.' prefix
			if (value === undefined) {
				const next = { ...headerChanges };
				delete next[headerPath];
				headerChanges = next;
			} else {
				headerChanges = { ...headerChanges, [headerPath]: value };
			}
		}

		// Apply the value change to headerData immutably
		const parts = path.split('.');
		const newData = { ...headerData };
		let current: Record<string, unknown> = newData;
		for (let i = 0; i < parts.length - 1; i++) {
			if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
				current[parts[i]] = {};
			}
			current[parts[i]] = { ...(current[parts[i]] as Record<string, unknown>) };
			current = current[parts[i]] as Record<string, unknown>;
		}
		current[parts[parts.length - 1]] = value;
		headerData = newData;
	}

	async function handleSave() {
		if (!pageData) return;
		saving = true;
		error = '';

		try {
			const body: Record<string, unknown> = {};
			if (title !== pageData.title) body.title = title;
			if (content !== (pageData.content ?? '')) body.content = content;
			if (template !== pageData.template) body.template = template;
			if (published !== pageData.published) body.published = published;
			if (visible !== pageData.visible) body.visible = visible;

			// Include header changes from blueprint form fields
			if (Object.keys(headerChanges).length > 0) {
				// Build nested header object from dot-notation keys
				const header: Record<string, unknown> = {};
				for (const [dotPath, val] of Object.entries(headerChanges)) {
					const parts = dotPath.split('.');
					let current = header;
					for (let i = 0; i < parts.length - 1; i++) {
						if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
							current[parts[i]] = {};
						}
						current = current[parts[i]] as Record<string, unknown>;
					}
					current[parts[parts.length - 1]] = val;
				}
				body.header = header;
			}

			if (Object.keys(body).length === 0) {
				toast.info('No changes to save');
				return;
			}

			const updated = await updatePage(route, body);
			pageData = updated;
			content = updated.content ?? content;
			headerChanges = {};
			toast.success('Page saved successfully');
		} catch (err: unknown) {
			if (err && typeof err === 'object' && 'message' in err) {
				toast.error((err as { message: string }).message);
			} else {
				toast.error('Failed to save page');
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
			toast.success('Page deleted');
			goto('/pages');
		} catch {
			toast.error('Failed to delete page');
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 's') {
			e.preventDefault();
			handleSave();
		}
	}

	$effect(() => { loadPage(); });
</script>

<svelte:head>
	<title>{title || 'Edit Page'} — Grav Admin</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="mx-auto max-w-6xl space-y-4">
	<!-- Top bar -->
	<div class="flex items-center justify-between gap-4">
		<div class="flex min-w-0 items-center gap-3">
			<button class="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground" onclick={() => goto('/pages')}>
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
			<Button variant="destructive" size="sm" onclick={handleDelete} disabled={loading}>
				<Trash2 size={14} />
				Delete
			</Button>
			<Button size="sm" onclick={handleSave} disabled={saving || loading}>
				{#if saving}
					<Loader2 size={14} class="animate-spin" />
					Saving...
				{:else}
					<Save size={14} />
					Save
				{/if}
			</Button>
		</div>
	</div>

	{#if error}
		<div class="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950/30 dark:text-red-300">
			<AlertCircle size={16} />
			{error}
		</div>
	{/if}

	{#if loading}
		<div class="py-20 text-center text-sm text-muted-foreground">Loading page...</div>
	{:else if pageData}
		<div class="grid gap-4 lg:grid-cols-[1fr_280px]">
			<!-- Main content area — blueprint IS the form -->
			<div class="space-y-4">
				{#if blueprint}
					<!-- Blueprint-driven form renders the full editor: tabs, fields, everything -->
					<BlueprintForm
						fields={blueprint.fields}
						data={headerData}
						onchange={handleBlueprintChange}
					/>
				{:else}
					<!-- Fallback when no blueprint is available -->
					<div class="rounded-lg border border-border bg-card p-4">
						<label class="label">
							<span class="text-sm font-medium text-foreground">Title</span>
							<input
								type="text"
								class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
								bind:value={title}
							/>
						</label>
					</div>
					<MarkdownEditor
						value={content}
						onchange={(v) => { content = v; }}
						placeholder="Write your markdown content here..."
						minHeight="400px"
					/>
				{/if}

				<!-- Raw header editor (collapsible) -->
				<div class="rounded-lg border border-border bg-card">
					<button
						class="flex w-full items-center gap-2 p-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
						onclick={() => showRawEditor = !showRawEditor}
					>
						<Code size={13} />
						Raw Page Header (JSON)
						<ChevronDown size={13} class="ml-auto transition-transform {showRawEditor ? 'rotate-180' : ''}" />
					</button>
					{#if showRawEditor}
						<div class="border-t border-border">
							<textarea
								class="flex min-h-[200px] w-full rounded-b-md bg-transparent px-4 py-3 font-mono text-xs placeholder:text-muted-foreground focus-visible:outline-none"
								bind:value={headerYaml}
								style="resize: vertical;"
							></textarea>
						</div>
					{/if}
				</div>
			</div>

			<!-- Sidebar -->
			<div class="space-y-4">
				<!-- Publishing -->
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

				<!-- Info -->
				<div class="rounded-lg border border-border bg-card p-4">
					<h3 class="mb-3 text-sm font-semibold text-foreground">Info</h3>
					<dl class="space-y-2 text-[13px]">
						<div class="flex justify-between">
							<dt class="text-muted-foreground">Route</dt>
							<dd class="max-w-[140px] truncate font-medium text-foreground" title={pageData.route}>{pageData.route}</dd>
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

				<!-- Page Media (shown when no blueprint provides a pagemedia field) -->
				{#if !blueprint}
					<div class="rounded-lg border border-border bg-card p-4">
						<PageMedia {route} />
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
