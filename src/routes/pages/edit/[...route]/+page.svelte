<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { setContext } from 'svelte';
	import { getPage, updatePage, deletePage } from '$lib/api/endpoints/pages';
	import { getPageBlueprint } from '$lib/api/endpoints/blueprints';
	import type { PageDetail } from '$lib/api/endpoints/pages';
	import type { BlueprintSchema } from '$lib/api/endpoints/blueprints';
	import type { MediaItem } from '$lib/api/endpoints/media';
	import type { PageMediaContext } from '$lib/components/media/types';
	import BlueprintForm from '$lib/components/blueprint/BlueprintForm.svelte';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import {
		Save, Trash2, ArrowLeft, Code,
		AlertCircle, ChevronDown, Loader2, Eye, ExternalLink, X, Undo2
	} from 'lucide-svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import { prefs } from '$lib/stores/preferences.svelte';
	import { createAutoSaveManager } from '$lib/utils/auto-save.svelte';
	import MarkdownEditor from '$lib/components/editors/MarkdownEditor.svelte';
	import PageMedia from '$lib/components/media/PageMedia.svelte';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import { createUnsavedGuard } from '$lib/utils/unsaved-guard.svelte';

	const route = $derived('/' + (page.params.route || ''));

	// Shared reactive media list — PageMedia writes to it, FilePickerField reads from it
	let pageMediaItems = $state<MediaItem[]>([]);
	function updatePageMedia(items: MediaItem[]) { pageMediaItems = items; }

	// Provide page route to child components (used by PageMedia field, etc.)
	setContext('pageRoute', () => route);
	// Expose page route globally for custom field web components (e.g., editor-pro)
	$effect(() => {
		window.__GRAV_PAGE_ROUTE = route;
		return () => { window.__GRAV_PAGE_ROUTE = ''; };
	});
	// Provide page type context (standard vs modular) for template selectors
	setContext('pageType', () => template?.startsWith('modular') ? 'modular' : 'standard');
	// Provide shared media list + updater so file pickers see uploads without saving
	setContext('pageMediaItems', {
		get items() { return pageMediaItems; },
		update: updatePageMedia,
	});

	let pageData = $state<PageDetail | null>(null);
	let blueprint = $state<BlueprintSchema | null>(null);
	let loading = $state(true);
	let saving = $state(false);
	let error = $state('');
	let showRawEditor = $state(false);

	// Preview
	let showFrontendPreview = $state(false);
	const frontendPreviewUrl = $derived(pageData ? `${auth.serverUrl}${pageData.route}` : '');

	// Editable fields
	let title = $state('');
	let content = $state('');
	let template = $state('');
	let headerData = $state<Record<string, unknown>>({});
	let headerChanges = $state<Record<string, unknown>>({});
	let headerYaml = $state('');

	let hasChanges = $derived(
		pageData !== null && (
			title !== pageData.title ||
			content !== (pageData.content ?? '') ||
			template !== pageData.template ||
			Object.keys(headerChanges).length > 0
		)
	);

	const guard = createUnsavedGuard(() => {
		if (prefs.autoSaveEnabled) {
			return hasChanges || autoSave.saving || autoSave.undoStack.some(e => !e.savedToServer);
		}
		return hasChanges;
	});

	const autoSave = createAutoSaveManager({
		save: handleSave,
		getValue: (path: string) => {
			const parts = path.split('.');
			let current: unknown = headerData;
			for (const part of parts) {
				if (current === null || current === undefined || typeof current !== 'object') return undefined;
				current = (current as Record<string, unknown>)[part];
			}
			return current;
		},
		applyChange: handleBlueprintChange,
		formName: 'Page',
	});

	async function loadPage() {
		loading = true;
		error = '';
		try {
			const data = await getPage(route, { render: false, translations: true });
			pageData = data;
			title = data.title;
			content = data.content ?? '';
			template = data.template;
			headerData = { header: { ...data.header ?? {}, title: data.title }, content: data.content ?? '', folder: data.slug, name: data.template };
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

	async function handleBlueprintChange(path: string, value: unknown) {
		// Sync special fields back to their state variables
		if (path === 'content') {
			content = value as string;
		} else if (path === 'header.title') {
			title = value as string;
		} else if (path === 'name') {
			// Template changed — reload the blueprint for the new template
			const newTemplate = value as string;
			template = newTemplate;
			try {
				blueprint = await getPageBlueprint(newTemplate);
			} catch {
				blueprint = null;
			}
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
			title = updated.title;
			content = updated.content ?? content;
			template = updated.template;
			headerData = { header: { ...updated.header ?? {}, title: updated.title }, content: updated.content ?? '', folder: updated.slug, name: updated.template };
			headerChanges = {};

			// Reload blueprint if template changed
			if (body.template) {
				try {
					blueprint = await getPageBlueprint(updated.template);
				} catch {
					blueprint = null;
				}
			}

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

	let confirmDeleteOpen = $state(false);

	function handleDelete() {
		if (!pageData) return;
		confirmDeleteOpen = true;
	}

	async function confirmDeletePage() {
		confirmDeleteOpen = false;
		try {
			await deletePage(route, { children: true });
			toast.success('Page deleted');
			goto(`${base}/pages`);
		} catch {
			toast.error('Failed to delete page');
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 's') {
			e.preventDefault();
			prefs.autoSaveEnabled ? autoSave.forceSave() : handleSave();
		}
		if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey && prefs.autoSaveEnabled) {
			const tag = (document.activeElement?.tagName ?? '').toLowerCase();
			const isEditable = tag === 'input' || tag === 'textarea' || (document.activeElement as HTMLElement)?.isContentEditable;
			if (!isEditable) {
				e.preventDefault();
				autoSave.undo();
			}
		}
	}

	$effect(() => { autoSave.reset(); loadPage(); });
</script>

<svelte:head>
	<title>{title || 'Edit Page'} — Grav Admin</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4 p-5">
	<!-- Top bar -->
	<div class="flex items-center justify-between gap-4">
		<div class="flex min-w-0 items-center gap-3">
			<button class="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground" onclick={() => goto(`${base}/pages`)}>
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
			{#if prefs.autoSaveEnabled}
				{#if autoSave.saving}
					<span class="text-xs text-muted-foreground">Saving...</span>
				{:else if autoSave.lastSavedAt}
					<span class="text-xs text-emerald-500">Saved</span>
				{:else if hasChanges}
					<span class="text-xs text-amber-500">Unsaved changes</span>
				{/if}
			{:else if hasChanges}
				<span class="text-xs text-amber-500">Unsaved changes</span>
			{/if}
			{#if prefs.autoSaveEnabled && prefs.autoSaveToolbarUndo && autoSave.canUndo}
				<Button variant="outline" size="sm" onclick={() => autoSave.undo()}>
					<Undo2 size={14} />
					Undo
				</Button>
			{/if}
			<Button variant="destructive" size="sm" onclick={handleDelete} disabled={loading}>
				<Trash2 size={14} />
				Delete
			</Button>
			<Button variant="outline" size="sm" onclick={() => showFrontendPreview = true} disabled={loading || !pageData}>
				<Eye size={14} />
				Preview
			</Button>
			<Button size="sm" class={hasChanges ? '' : 'opacity-50 pointer-events-none'} onclick={handleSave} disabled={saving || loading}>
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
					<!-- Key on template name to force full re-mount when blueprint changes -->
					{#key blueprint.name}
						<BlueprintForm
							fields={blueprint.fields}
							data={headerData}
							onchange={handleBlueprintChange}
							oncommit={autoSave.oncommit}
						/>
					{/key}
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
				<!-- Page Status & Info -->
				<div class="rounded-lg border border-border bg-card p-4">
					<h3 class="mb-3 text-sm font-semibold text-foreground">Page Info</h3>
					<dl class="space-y-2.5 text-[13px]">
						<!-- Status indicators -->
						<div class="flex justify-between">
							<dt class="flex items-center gap-1.5 text-muted-foreground">
								{#if pageData.published}
									<span class="h-2 w-2 rounded-full bg-emerald-500"></span>
								{:else}
									<span class="h-2 w-2 rounded-full bg-muted-foreground/40"></span>
								{/if}
								Published
							</dt>
							<dd class="font-medium {pageData.published ? 'text-emerald-500' : 'text-muted-foreground'}">
								{pageData.published ? 'Yes' : 'No'}
							</dd>
						</div>
						<div class="flex justify-between">
							<dt class="flex items-center gap-1.5 text-muted-foreground">
								{#if pageData.visible}
									<span class="h-2 w-2 rounded-full bg-primary"></span>
								{:else}
									<span class="h-2 w-2 rounded-full bg-muted-foreground/40"></span>
								{/if}
								Visible in nav
							</dt>
							<dd class="font-medium {pageData.visible ? 'text-primary' : 'text-muted-foreground'}">
								{pageData.visible ? 'Yes' : 'No'}
							</dd>
						</div>
						{#if pageData.routable !== undefined}
							<div class="flex justify-between">
								<dt class="text-muted-foreground">Routable</dt>
								<dd class="font-medium {pageData.routable ? 'text-foreground' : 'text-muted-foreground'}">
									{pageData.routable ? 'Yes' : 'No'}
								</dd>
							</div>
						{/if}

						<div class="my-1 border-t border-border"></div>

						<!-- Page details -->
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
						{#if pageData.order}
							<div class="flex justify-between">
								<dt class="text-muted-foreground">Order</dt>
								<dd class="font-medium text-foreground">{pageData.order}</dd>
							</div>
						{/if}

						<div class="my-1 border-t border-border"></div>

						<!-- Dates -->
						{#if pageData.date}
							<div class="flex justify-between">
								<dt class="text-muted-foreground">Date</dt>
								<dd class="font-medium text-foreground">{new Date(pageData.date).toLocaleDateString()}</dd>
							</div>
						{/if}
						<div class="flex justify-between">
							<dt class="text-muted-foreground">Modified</dt>
							<dd class="font-medium text-foreground">{new Date(pageData.modified).toLocaleString()}</dd>
						</div>
						{#if pageData.header?.publish_date}
							<div class="flex justify-between">
								<dt class="text-muted-foreground">Publish on</dt>
								<dd class="font-medium text-emerald-500">{new Date(pageData.header.publish_date as string).toLocaleString()}</dd>
							</div>
						{/if}
						{#if pageData.header?.unpublish_date}
							<div class="flex justify-between">
								<dt class="text-muted-foreground">Unpublish on</dt>
								<dd class="font-medium text-amber-500">{new Date(pageData.header.unpublish_date as string).toLocaleString()}</dd>
							</div>
						{/if}
					</dl>
				</div>

				<!-- Page Media (shown when no blueprint provides a pagemedia field) -->
				{#if !blueprint}
					<div class="rounded-lg border border-border bg-card p-4">
						<PageMedia {route} onMediaChange={updatePageMedia} externalItems={pageMediaItems} />
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<ConfirmModal
	open={confirmDeleteOpen}
	title="Delete Page"
	message={`Delete "${pageData?.title}" at ${route}? This cannot be undone.`}
	confirmLabel="Delete"
	variant="destructive"
	onconfirm={confirmDeletePage}
	oncancel={() => { confirmDeleteOpen = false; }}
/>

<ConfirmModal
	open={guard.showModal}
	title="Unsaved Changes"
	message="You have unsaved changes. Leave anyway?"
	confirmLabel="Leave"
	cancelLabel="Stay"
	onconfirm={guard.confirm}
	oncancel={guard.cancel}
/>

<!-- Frontend Preview Modal -->
{#if showFrontendPreview && frontendPreviewUrl}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/80 p-4 backdrop-blur-sm sm:p-6"
		onclick={(e) => { if (e.target === e.currentTarget) showFrontendPreview = false; }}
	>
		<div class="flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
			<!-- Header -->
			<div class="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
				<div class="flex items-center gap-3">
					<h2 class="text-sm font-semibold text-foreground">Page Preview</h2>
					<span class="truncate text-xs text-muted-foreground">{frontendPreviewUrl}</span>
				</div>
				<div class="flex items-center gap-2">
					<a
						href={frontendPreviewUrl}
						target="_blank"
						rel="noopener"
						class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					>
						<ExternalLink size={13} />
						Open in New Tab
					</a>
					<button
						class="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						onclick={() => showFrontendPreview = false}
					>
						<X size={16} />
					</button>
				</div>
			</div>

			<!-- iframe -->
			<div class="flex-1 bg-white">
				<iframe
					src={frontendPreviewUrl}
					title="Page Preview"
					class="h-full w-full border-0"
					sandbox="allow-same-origin allow-scripts allow-forms"
				></iframe>
			</div>
		</div>
	</div>
{/if}
