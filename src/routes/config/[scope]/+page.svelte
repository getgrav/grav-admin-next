<script lang="ts">
	import { page } from '$app/state';
	import { setContext } from 'svelte';
	import { provideFormCommit } from '$lib/utils/form-commit.svelte';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import UnsavedIndicator from '$lib/components/ui/UnsavedIndicator.svelte';
	import { createUnsavedGuard } from '$lib/utils/unsaved-guard.svelte';
	import { getConfig, saveConfig, getConfigSections } from '$lib/api/endpoints/config';
	import { getConfigBlueprint } from '$lib/api/endpoints/blueprints';
	import type { BlueprintSchema } from '$lib/api/endpoints/blueprints';
	import BlueprintForm from '$lib/components/blueprint/BlueprintForm.svelte';
	import ConfigNav from '$lib/components/config/ConfigNav.svelte';
	import ConfigInfoPage from '$lib/components/config/ConfigInfoPage.svelte';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import { Save, AlertCircle, Loader2, RefreshCw, Search, X, Undo2 } from 'lucide-svelte';
	import StickyHeader from '$lib/components/ui/StickyHeader.svelte';
	import { prefs } from '$lib/stores/preferences.svelte';
	import { createAutoSaveManager } from '$lib/utils/auto-save.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { invalidations } from '$lib/stores/invalidation.svelte';
	import { onMount } from 'svelte';
	import ContextPanelTriggers from '$lib/components/context-panels/ContextPanelTriggers.svelte';
	import { can, canWrite } from '$lib/utils/permissions';
	import AccessDenied from '$lib/components/ui/AccessDenied.svelte';

	const REDACTED = '********';
	const translateLabel = i18n.tMaybe;

	const scope = $derived(page.params.scope ?? 'system');
	// Scope for blueprint-upload destination resolution. `self@:` on core
	// config scopes (system/site) has no natural owner; destinations pointing
	// at a stream (`user://...`, `account://...`) still work without scope.
	setContext('blueprintScope', () => 'config/' + scope);
	// Bus for leaf fields that defer side effects to the save commit.
	const formCommit = provideFormCommit();
	const isInfo = $derived(scope === 'info');

	let sections = $state<string[]>(['system', 'site', 'media', 'security', 'info']);
	let blueprint = $state<BlueprintSchema | null>(null);
	let configData = $state<Record<string, unknown>>({});
	let originalJson = $state('{}');
	let etag = $state('');
	let loading = $state(true);
	let saving = $state(false);
	let error = $state('');

	let accessDenied = $state(false);
	let hasChanges = $derived(JSON.stringify(configData) !== originalJson);
	const canSave = $derived(canWrite('config'));
	let filter = $state('');
	let headerHeight = $state(0);

	function scopeTitle(s: string): string {
		const key = `PLUGIN_ADMIN.${s.toUpperCase()}`;
		const translated = translateLabel(key);
		return translated !== key ? translated : s.charAt(0).toUpperCase() + s.slice(1);
	}

	async function loadSections() {
		try {
			sections = await getConfigSections();
		} catch {
			// Fall back to hardcoded list
		}
	}

	async function loadConfig() {
		loading = true;
		error = '';
		accessDenied = false;
		blueprint = null;

		try {
			if (isInfo) {
				loading = false;
				return;
			}

			const [blueprintResult, configResult] = await Promise.all([
				getConfigBlueprint(scope).catch(() => null),
				getConfig(scope)
			]);

			blueprint = blueprintResult;
			configData = configResult.data;
			originalJson = JSON.stringify(configResult.data);
			etag = configResult.etag;
		} catch (err: unknown) {
			const status = err && typeof err === 'object' && 'status' in err
				? (err as { status: number }).status : 0;
			if (status === 403) {
				accessDenied = true;
			} else if (status === 404) {
				error = `Configuration scope '${scope}' not found.`;
			} else {
				error = 'Failed to load configuration.';
			}
		} finally {
			loading = false;
		}
	}

	function handleBlueprintChange(path: string, value: unknown) {
		// Immutably update the nested path in configData
		const parts = path.split('.');
		const newData = { ...configData };
		let current: Record<string, unknown> = newData;

		for (let i = 0; i < parts.length - 1; i++) {
			if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
				current[parts[i]] = {};
			}
			current[parts[i]] = { ...(current[parts[i]] as Record<string, unknown>) };
			current = current[parts[i]] as Record<string, unknown>;
		}

		current[parts[parts.length - 1]] = value;
		configData = newData;
	}

	/**
	 * Strip redacted sentinel values to avoid overwriting real secrets.
	 */
	function stripRedacted(data: Record<string, unknown>): Record<string, unknown> {
		const result: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(data)) {
			if (value === REDACTED) continue;
			if (value && typeof value === 'object' && !Array.isArray(value)) {
				result[key] = stripRedacted(value as Record<string, unknown>);
			} else {
				result[key] = value;
			}
		}
		return result;
	}

	async function handleSave() {
		if (!hasChanges || isInfo) return;
		saving = true;
		error = '';

		try {
			const cleanData = stripRedacted(configData);
			const result = await saveConfig(scope, cleanData, etag);
			configData = result.data;
			originalJson = JSON.stringify(result.data);
			etag = result.etag;
			await formCommit.emit();
			toast.success(i18n.t('ADMIN_NEXT.CONFIG.CONFIGURATION_SAVED_SUCCESSFULLY'));
		} catch (err: unknown) {
			if (err && typeof err === 'object' && 'status' in err) {
				const status = (err as { status: number }).status;
				if (status === 409) {
					toast.error(i18n.t('ADMIN_NEXT.CONFIG.CONFIGURATION_WAS_MODIFIED_ELSEWHERE'));
					return;
				}
			}
			if (err && typeof err === 'object' && 'message' in err) {
				toast.error((err as { message: string }).message);
			} else {
				toast.error(i18n.t('ADMIN_NEXT.CONFIG.FAILED_TO_SAVE_CONFIGURATION'));
			}
		} finally {
			saving = false;
		}
	}

	async function handleReload() {
		await loadConfig();
		toast.info(i18n.t('ADMIN_NEXT.CONFIG.CONFIGURATION_RELOADED'));
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

	// Warn about unsaved changes on navigation
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
		formName: 'Configuration',
	});

	// Load sections once, reload config when scope changes
	$effect(() => { loadSections(); });
	$effect(() => { scope; autoSave.reset(); loadConfig(); });

	// Refetch when the current scope is updated elsewhere (with dirty guard).
	onMount(() => {
		const unsub = invalidations.subscribe('config:update', (e) => {
			if (e.id !== scope) return;
			if (!hasChanges) loadConfig();
			else toast.info(i18n.t('ADMIN_NEXT.CONFIG.CONFIGURATION_CHANGED_ELSEWHERE_SAVE_TO'));
		}, {
			// Skip self-echo: our own PATCH emits this same event before handleSave
			// has cleared hasChanges, which would otherwise toast on every save.
			dirtyGuard: () => saving || autoSave.saving,
		});
		return () => { unsub(); };
	});
</script>

<svelte:head>
	<title>{i18n.t('ADMIN_NEXT.CONFIG.PAGE_TITLE', { scope: scopeTitle(scope) })}</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div style="--sticky-header-height: {headerHeight}px">
	<StickyHeader bind:height={headerHeight}>
		{#snippet children({ scrolled })}
			<div class="space-y-3 px-6 transition-[padding] duration-200 {scrolled ? 'py-2' : 'pt-6 pb-3'}">
				<div class="flex items-center justify-between gap-4 {scrolled ? 'min-h-6' : 'min-h-8'}">
					<div>
						<h1 class="font-semibold tracking-tight text-foreground transition-[font-size] duration-200 {scrolled ? 'text-sm' : 'text-xl'}">{scrolled ? `Configuration: ${scopeTitle(scope)}` : 'Configuration'}</h1>
						{#if !scrolled}
							<p class="mt-0.5 text-xs text-muted-foreground">{scopeTitle(scope)}</p>
						{/if}
					</div>

					{#if !isInfo}
						<div class="flex shrink-0 items-center gap-2">
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
							<ContextPanelTriggers context="config" route={scope} lang="" />
							<Button variant="outline" size="sm" onclick={handleReload} disabled={loading || saving}>
								<RefreshCw size={14} />
								{i18n.t('ADMIN_NEXT.CONFIG.RELOAD')}
							</Button>
							<Button size="sm" onclick={handleSave} disabled={saving || loading || !hasChanges || !canSave}>
								{#if saving}
									<Loader2 size={14} class="animate-spin" />
									{i18n.t('ADMIN_NEXT.SAVING')}
								{:else}
									<Save size={14} />
									Save
								{/if}
							</Button>
						</div>
					{/if}
				</div>

				<!-- Scope navigation tabs + filter -->
				<div class="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:gap-3">
					<div class="min-w-0 flex-1">
						<ConfigNav {sections} />
					</div>
					{#if isInfo || blueprint}
						<div class="relative w-full sm:w-48">
							<Search size={14} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
							<input
								type="text"
								class="h-8 w-full rounded-md border border-input bg-transparent pl-9 pr-8 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
								placeholder={i18n.t('ADMIN_NEXT.CONFIG.FILTER_FIELDS')}
								bind:value={filter}
							/>
							{#if filter}
								<button
									class="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground"
									onclick={() => filter = ''}
									aria-label={i18n.t('ADMIN_NEXT.CONFIG.CLEAR_FILTER')}
								>
									<X size={14} />
								</button>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		{/snippet}
	</StickyHeader>

	<div class="relative z-0 space-y-4 px-6 pb-6" style="overflow-anchor: none">
		{#if accessDenied}
		<AccessDenied message="You don't have permission to view configuration." />
	{:else if error}
		<div class="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950/30 dark:text-red-300">
			<AlertCircle size={16} />
			{error}
		</div>
	{/if}

	{#if !accessDenied && !canSave && !loading && !isInfo && !error}
		<AccessDenied compact message="You have read-only access to configuration." />
	{/if}

	{#if loading}
		<div class="py-20 text-center text-sm text-muted-foreground">{i18n.t('ADMIN_NEXT.CONFIG.LOADING_CONFIGURATION')}</div>
	{:else if isInfo}
		<ConfigInfoPage {filter} />
	{:else if blueprint}
		<BlueprintForm
			fields={blueprint.fields}
			data={configData}
			onchange={handleBlueprintChange}
			oncommit={autoSave.oncommit}
			{filter}
		/>
	{:else if !error}
		<div class="py-20 text-center text-sm text-muted-foreground">
			{i18n.t('ADMIN_NEXT.CONFIG.NO_CONFIGURATION_BLUEPRINT_AVAILABLE')}
		</div>
	{/if}
	</div>
</div>

<ConfirmModal
	open={guard.showModal}
	title={i18n.t('ADMIN_NEXT.UNSAVED_CHANGES')}
	message="You have unsaved changes. Leave anyway?"
	confirmLabel="Leave"
	cancelLabel="Stay"
	onconfirm={guard.confirm}
	oncancel={guard.cancel}
/>
