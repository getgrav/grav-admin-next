<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { setContext } from 'svelte';
	import { provideFormCommit } from '$lib/utils/form-commit.svelte';
	import { getTheme, getThemeConfig, saveThemeConfig, setActiveTheme, removeTheme, getThemeReadme, getThemeChangelog, updatePackage, type ThemeInfo } from '$lib/api/endpoints/gpm';
	import { reloadIfAdminUpdated } from '$lib/utils/gpm';
	import { getThemeBlueprint } from '$lib/api/endpoints/blueprints';
	import type { BlueprintSchema } from '$lib/api/endpoints/blueprints';
	import BlueprintForm from '$lib/components/blueprint/BlueprintForm.svelte';
	import MarkdownModal from '$lib/components/ui/MarkdownModal.svelte';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import UnsavedIndicator from '$lib/components/ui/UnsavedIndicator.svelte';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import {
		Save, ArrowLeft, Loader2, AlertCircle, Trash2, BadgeCheck,
		Palette, ExternalLink, Power, BookOpen, FileText, ArrowUpCircle, CornerDownRight
	} from 'lucide-svelte';

	import { faIconClass, parseKeywords, isFirstParty } from '$lib/utils/gpm';
	import { auth } from '$lib/stores/auth.svelte';
	import { prefs } from '$lib/stores/preferences.svelte';
	import { createAutoSaveManager } from '$lib/utils/auto-save.svelte';
	import { createUnsavedGuard } from '$lib/utils/unsaved-guard.svelte';
	import { dialogs } from '$lib/stores/dialogs.svelte';
	import { Undo2 } from 'lucide-svelte';
	import ContextPanelTriggers from '$lib/components/context-panels/ContextPanelTriggers.svelte';

	const REDACTED = '********';

	const slug = $derived(page.params.slug ?? '');
	// Scope for blueprint-upload destination resolution (`self@:` → theme dir).
	setContext('blueprintScope', () => slug ? 'themes/' + slug : '');
	// Bus for leaf fields that defer side effects to the save commit
	// (FileField uses this to unlink removed files once the form persists).
	const formCommit = provideFormCommit();

	let theme = $state<ThemeInfo | null>(null);
	let blueprint = $state<BlueprintSchema | null>(null);
	let configData = $state<Record<string, unknown>>({});
	let originalJson = $state('{}');
	let etag = $state('');
	let loading = $state(true);
	let saving = $state(false);
	let activating = $state(false);
	let deleting = $state(false);
	let updating = $state(false);
	let error = $state('');

	let hasChanges = $derived(JSON.stringify(configData) !== originalJson);

	// Modal state for README / Changelog
	let modalOpen = $state(false);
	let modalTitle = $state('');
	let modalContent = $state('');
	let modalLoading = $state(false);

	// Confirm delete modal
	let confirmDeleteOpen = $state(false);

	// Screenshot lightbox
	let screenshotOpen = $state(false);

	function resolveUrl(url: string | null | undefined): string | null {
		if (!url) return null;
		if (url.startsWith('http')) return url;
		const base = auth.serverUrl ?? '';
		return `${base}${url}`;
	}

	async function showReadme() {
		modalLoading = true;
		modalTitle = `${theme?.name ?? slug} — README`;
		modalContent = '';
		modalOpen = true;
		try {
			modalContent = await getThemeReadme(slug);
		} catch {
			modalContent = '*README not available.*';
		} finally {
			modalLoading = false;
		}
	}

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
			.replace(/^\d+\.\s*\[]\(#(\w+)\)\s*$/gm, (_match, type: string) => {
				const color = badgeColors[type] ?? 'background:#6b7280;color:white';
				const label = badgeLabels[type] ?? type;
				return `<span style="${color};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;display:inline-block;margin-top:8px">${label}</span>\n`;
			})
			.replace(/^ {4}\* /gm, '- ')
			.replace(/^\t\* /gm, '- ');
	}

	async function showChangelog() {
		modalLoading = true;
		modalTitle = `${theme?.name ?? slug} — Changelog`;
		modalContent = '';
		modalOpen = true;
		try {
			const raw = await getThemeChangelog(slug);
			modalContent = formatChangelog(raw);
		} catch {
			modalContent = '*Changelog not available.*';
		} finally {
			modalLoading = false;
		}
	}

	async function loadTheme() {
		loading = true;
		error = '';

		try {
			const [themeResult, blueprintResult, configResult] = await Promise.all([
				getTheme(slug),
				getThemeBlueprint(slug).catch(() => null),
				getThemeConfig(slug).catch(() => ({ data: {}, etag: '' })),
			]);

			theme = themeResult;
			blueprint = blueprintResult;
			configData = configResult.data;
			originalJson = JSON.stringify(configResult.data);
			etag = configResult.etag;
		} catch {
			error = `Failed to load theme '${slug}'.`;
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
			await saveThemeConfig(slug, cleaned, etag);

			const fresh = await getThemeConfig(slug);
			configData = fresh.data;
			originalJson = JSON.stringify(fresh.data);
			etag = fresh.etag;

			// Flush deferred field-level side effects now that the save is
			// persisted (e.g. FileField unlinking files the user removed).
			await formCommit.emit();

			toast.success(`${theme?.name ?? slug} configuration saved`);
		} catch (err: unknown) {
			if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 409) {
				toast.error(i18n.t('ADMIN_NEXT.THEMES.CONFIGURATION_WAS_MODIFIED_ELSEWHERE'));
			} else {
				toast.error(i18n.t('ADMIN_NEXT.THEMES.FAILED_TO_SAVE_CONFIGURATION'));
			}
		} finally {
			saving = false;
		}
	}

	async function handleActivate() {
		if (!theme || theme.enabled) return;
		activating = true;
		try {
			await setActiveTheme(slug);
			theme = { ...theme, enabled: true };
			toast.success(`${theme.name} is now the active theme`);
		} catch {
			toast.error(`Failed to activate ${theme?.name ?? slug}`);
		} finally {
			activating = false;
		}
	}

	const PROTECTED_THEMES = new Set(['admin']);

	function handleDelete() {
		if (!theme) return;
		if (PROTECTED_THEMES.has(theme.slug)) {
			toast.error(`${theme.name} cannot be removed.`);
			return;
		}
		if (theme.enabled) {
			toast.error(`Cannot remove the active theme. Switch to another theme first.`);
			return;
		}
		confirmDeleteOpen = true;
	}

	async function confirmDelete() {
		confirmDeleteOpen = false;
		deleting = true;
		try {
			await removeTheme(slug);
			toast.success(`${theme?.name ?? slug} removed`);
			goto(`${base}/themes`);
		} catch {
			toast.error(`Failed to remove ${theme?.name ?? slug}`);
		} finally {
			deleting = false;
		}
	}

	async function handleUpdate() {
		if (!theme || !theme.updatable) return;
		const ok = await dialogs.confirm({
			title: 'Update theme?',
			message: `Update ${theme.name} to v${theme.available_version}?`,
			confirmLabel: 'Update',
		});
		if (!ok) return;
		updating = true;
		try {
			const result = await updatePackage(slug);
			for (const depSlug of result.dependencies ?? []) {
				toast.success(`Plugin '${depSlug}' installed (dependency)`);
			}
			toast.success(`${theme.name} updated`);
			await loadTheme();
			reloadIfAdminUpdated([slug, ...(result.dependencies ?? [])]);
		} catch (err: unknown) {
			const detail = err instanceof Error ? err.message : String(err);
			toast.error(`Failed to update ${theme.name}: ${detail}`);
		} finally {
			updating = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && screenshotOpen) {
			screenshotOpen = false;
			return;
		}
		if ((e.metaKey || e.ctrlKey) && e.key === 's') {
			e.preventDefault();
			prefs.autoSaveEnabled ? autoSave.forceSave() : (hasChanges && !saving && handleSave());
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
			let current: unknown = configData;
			for (const part of parts) {
				if (current === null || current === undefined || typeof current !== 'object') return undefined;
				current = (current as Record<string, unknown>)[part];
			}
			return current;
		},
		applyChange: handleBlueprintChange,
		formName: 'Theme',
	});

	$effect(() => {
		slug; // track
		autoSave.reset();
		loadTheme();
	});
</script>

<svelte:head>
	<title>{i18n.t('ADMIN_NEXT.THEMES.PAGE_TITLE', { name: theme?.name ?? slug })}</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="flex h-full flex-col">
	<!-- Header -->
	<div class="flex flex-col gap-3 border-b border-border px-6 pt-6 pb-3 sm:min-h-14 sm:flex-row sm:items-center sm:justify-between sm:gap-0">
		<div class="flex items-center gap-3">
			<button
				type="button"
				class="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				onclick={() => goto(`${base}/themes`)}
			>
				<ArrowLeft size={16} />
			</button>
			{#if theme}
				<div class="flex items-center gap-3">
					<div class="flex h-9 w-9 items-center justify-center rounded-lg {theme.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}">
						{#if theme.icon}
							<i class="{faIconClass(theme.icon)} text-sm"></i>
						{:else}
							<Palette size={16} />
						{/if}
					</div>
					<div>
						<div class="flex items-center gap-1.5">
							<h1 class="text-lg font-semibold text-foreground">{theme.name}</h1>
							{#if isFirstParty(theme.author)}
								<BadgeCheck size={18} class="shrink-0 text-purple-500" />
							{/if}
							{#if theme.is_symlink}
								<span class="inline-flex shrink-0" title={i18n.t('ADMIN_NEXT.THEMES.SYMLINKED')}><CornerDownRight size={14} class="text-muted-foreground/60" aria-label={i18n.t('ADMIN_NEXT.THEMES.SYMLINKED')} /></span>
							{/if}
							{#if theme.premium}
								<span class="shrink-0 rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">{i18n.t('ADMIN_NEXT.PREMIUM')}</span>
							{/if}
						</div>
						<div class="flex items-center gap-2 text-xs text-muted-foreground">
							<span>v{theme.version}</span>
							{#if theme.author?.name}
								<span>by {theme.author.name}</span>
							{/if}
						</div>
					</div>
				</div>
			{/if}
		</div>

		<div class="flex flex-wrap items-center justify-center gap-2 sm:justify-end">
			<UnsavedIndicator
				hasChanges={hasChanges}
				saving={autoSave.saving}
				lastSavedAt={autoSave.lastSavedAt}
				autoSaveEnabled={prefs.autoSaveEnabled}
			/>
			{#if prefs.autoSaveEnabled && prefs.autoSaveToolbarUndo && autoSave.canUndo}
				<Button variant="outline" size="sm" onclick={() => autoSave.undo()}>
					<Undo2 size={14} />
					Undo
				</Button>
			{/if}
			<ContextPanelTriggers context="themes" route={slug} lang="" />
			{#if theme}
				<!-- Update button -->
				{#if theme.updatable}
					<Button
						variant="outline"
						size="sm"
						onclick={handleUpdate}
						disabled={updating}
						aria-label={i18n.t('ADMIN_NEXT.UPDATE_TO_VERSION', { version: theme.available_version })}
						title={i18n.t('ADMIN_NEXT.UPDATE_TO_VERSION', { version: theme.available_version })}
					>
						{#if updating}
							<Loader2 size={14} class="sm:mr-1.5 animate-spin" />
						{:else}
							<ArrowUpCircle size={14} class="sm:mr-1.5" />
						{/if}
						<span class="hidden sm:inline">{i18n.t('ADMIN_NEXT.UPDATE_TO_VERSION', { version: theme.available_version })}</span>
					</Button>
				{/if}

				<!-- Delete button -->
				<Button
					variant="destructive"
					size="sm"
					onclick={handleDelete}
					disabled={deleting || theme.enabled || PROTECTED_THEMES.has(theme.slug)}
					aria-label={i18n.t('ADMIN_NEXT.REMOVE')}
					title={i18n.t('ADMIN_NEXT.REMOVE')}
				>
					{#if deleting}
						<Loader2 size={14} class="sm:mr-1.5 animate-spin" />
					{:else}
						<Trash2 size={14} class="sm:mr-1.5" />
					{/if}
					<span class="hidden sm:inline">{i18n.t('ADMIN_NEXT.REMOVE')}</span>
				</Button>

				<!-- Activate button -->
				{#if !theme.enabled}
					<Button
						variant="outline"
						size="sm"
						onclick={handleActivate}
						disabled={activating}
						aria-label={i18n.t('ADMIN_NEXT.ACTIVATE')}
						title={i18n.t('ADMIN_NEXT.ACTIVATE')}
					>
						{#if activating}
							<Loader2 size={14} class="sm:mr-1.5 animate-spin" />
						{:else}
							<Power size={14} class="sm:mr-1.5" />
						{/if}
						<span class="hidden sm:inline">{i18n.t('ADMIN_NEXT.ACTIVATE')}</span>
					</Button>
				{:else}
					<span class="inline-flex h-8 items-center rounded-md bg-green-500/15 px-2 text-xs font-medium text-green-600 dark:text-green-400 sm:px-3" title={i18n.t('ADMIN_NEXT.THEMES.ACTIVE_THEME')}>
						<span class="hidden sm:inline">{i18n.t('ADMIN_NEXT.THEMES.ACTIVE_THEME')}</span>
						<BadgeCheck size={14} class="sm:hidden" />
					</span>
				{/if}

				<!-- Save button -->
				<Button
					size="sm"
					onclick={handleSave}
					disabled={!hasChanges || saving}
					aria-label="Save"
					title="Save"
				>
					{#if saving}
						<Loader2 size={14} class="sm:mr-1.5 animate-spin" />
					{:else}
						<Save size={14} class="sm:mr-1.5" />
					{/if}
					<span class="hidden sm:inline">Save</span>
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
				<Button variant="outline" size="sm" class="mt-3" onclick={() => goto(`${base}/themes`)}>
					{i18n.t('ADMIN_NEXT.THEMES.BACK_TO_THEMES')}
				</Button>
			</div>
		</div>
	{:else if theme}
		<div class="flex-1 overflow-y-auto">
			<div class="space-y-6 px-6 py-6">
				<!-- Theme info card -->
				<div class="rounded-xl border border-border bg-card p-5">
					<div class="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
						<!-- Thumbnail -->
						{#if resolveUrl(theme.thumbnail ?? theme.screenshot)}
							<button
								type="button"
								class="shrink-0 overflow-hidden rounded-lg border border-border transition-shadow hover:shadow-lg hover:ring-2 hover:ring-primary/30"
								onclick={() => { screenshotOpen = true; }}
								title={i18n.t('ADMIN_NEXT.THEMES.CLICK_TO_VIEW_FULL_SIZE')}
							>
								<img
									src={resolveUrl(theme.thumbnail ?? theme.screenshot)}
									alt={theme.name}
									class="block h-[200px] w-[200px] object-cover"
								/>
							</button>
						{:else}
							<div class="flex h-[200px] w-[200px] shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
								<Palette size={48} />
							</div>
						{/if}
						<div class="min-w-0 flex-1 text-center sm:text-left">
							{#if theme.description}
								{#if theme.description_html}
									<div class="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed text-muted-foreground [&_a]:text-primary [&_a]:no-underline hover:[&_a]:underline [&_p]:my-0 [&_p+p]:mt-2">
										{@html theme.description_html}
									</div>
								{:else}
									<p class="text-sm leading-relaxed text-muted-foreground">{theme.description}</p>
								{/if}
							{/if}
							<div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
								{#if theme.homepage}
									<a href={theme.homepage} target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-primary hover:underline">
										{i18n.t('ADMIN_NEXT.HOMEPAGE')} <ExternalLink size={10} />
									</a>
								{/if}
								{#if theme.author?.url}
									<a href={theme.author.url} target="_blank" rel="noopener" class="inline-flex items-center gap-1 hover:text-foreground">
										{theme.author.name} <ExternalLink size={10} />
									</a>
								{:else if theme.author?.name}
									<span>{theme.author.name}</span>
								{/if}
								<button type="button" class="inline-flex items-center gap-1 hover:text-foreground" onclick={showReadme}>
									<BookOpen size={10} /> README
								</button>
								<button type="button" class="inline-flex items-center gap-1 hover:text-foreground" onclick={showChangelog}>
									<FileText size={10} /> {i18n.t('ADMIN_NEXT.THEMES.CHANGELOG')}
								</button>
							</div>
							{#if parseKeywords(theme.keywords).length}
								<div class="mt-2 flex flex-wrap gap-1">
									{#each parseKeywords(theme.keywords) as kw}
										<span class="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{kw}</span>
									{/each}
								</div>
							{/if}
						</div>
					</div>
				</div>

				<!-- Configuration form -->
				{#if blueprint}
					<BlueprintForm
						fields={blueprint.fields}
						data={configData}
						onchange={handleBlueprintChange}
						oncommit={autoSave.oncommit}
					/>
				{:else}
					<div class="rounded-xl border border-dashed border-border p-8 text-center">
						<p class="text-sm text-muted-foreground">
							{i18n.t('ADMIN_NEXT.THEMES.NO_CONFIGURATION_OPTIONS_AVAILABLE_FOR')}
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

<ConfirmModal
	open={confirmDeleteOpen}
	title={i18n.t('ADMIN_NEXT.THEMES.REMOVE_THEME')}
	message={`Are you sure you want to remove "${theme?.name ?? slug}"? This will permanently delete the theme files.`}
	confirmLabel="Remove"
	variant="destructive"
	onconfirm={confirmDelete}
	oncancel={() => { confirmDeleteOpen = false; }}
/>

<ConfirmModal
	open={guard.showModal}
	title={i18n.t('ADMIN_NEXT.UNSAVED_CHANGES')}
	message="You have unsaved changes. Leave anyway?"
	confirmLabel="Leave"
	cancelLabel="Stay"
	onconfirm={guard.confirm}
	oncancel={guard.cancel}
/>

<!-- Screenshot lightbox -->
{#if screenshotOpen && resolveUrl(theme?.screenshot)}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/75 p-8 backdrop-blur-sm"
		onclick={() => { screenshotOpen = false; }}
	>
		<img
			src={resolveUrl(theme?.screenshot)}
			alt={theme?.name ?? ''}
			class="max-h-full max-w-full rounded-lg shadow-2xl"
			onclick={(e) => e.stopPropagation()}
		/>
	</div>
{/if}
