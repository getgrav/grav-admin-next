<script lang="ts">
	import { page } from '$app/state';
	import { setContext } from 'svelte';
	import { provideFormCommit } from '$lib/utils/form-commit.svelte';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import UnsavedChangesModal from '$lib/components/ui/UnsavedChangesModal.svelte';
	import UnsavedIndicator from '$lib/components/ui/UnsavedIndicator.svelte';
	import { createUnsavedGuard } from '$lib/utils/unsaved-guard.svelte';
	import { getConfig, saveConfig, getConfigSections, revertConfig } from '$lib/api/endpoints/config';
	import { ApiRequestError } from '$lib/api/client';
	import type { ConfigOverridesCtx } from '$lib/components/blueprint/FieldOverrideIndicator.svelte';
	import { getConfigBlueprint } from '$lib/api/endpoints/blueprints';
	import type { BlueprintSchema } from '$lib/api/endpoints/blueprints';
	import BlueprintForm from '$lib/components/blueprint/BlueprintForm.svelte';
	import { checkRequiredOrToast, scrollToFirstError, validateFieldAt, stableJson } from '$lib/utils/blueprint-validation';
	import ConfigNav from '$lib/components/config/ConfigNav.svelte';
	import TwigContentProfile from '$lib/components/config/TwigContentProfile.svelte';
	import ConfigInfoPage from '$lib/components/config/ConfigInfoPage.svelte';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import { Save, AlertCircle, Loader2, RefreshCw, Search, X, Undo2, RotateCcw } from 'lucide-svelte';
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
	// Override map for the active layer: which dotted paths the current file
	// overrides, and what each reverts to. Drives the per-field revert icons.
	let overrides = $state<string[]>([]);
	let fallback = $state<Record<string, unknown>>({});
	let showResetModal = $state(false);
	let reverting = $state(false);
	let loading = $state(true);
	let saving = $state(false);
	let error = $state('');
	let validationErrors = $state<Record<string, string>>({});

	let accessDenied = $state(false);
	let hasChanges = $derived(stableJson(configData) !== originalJson);
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
			originalJson = stableJson(configResult.data);
			etag = configResult.etag;
			overrides = configResult.overrides;
			fallback = configResult.fallback;
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

		// Re-check this field now it's been touched: flag it if a required field was
		// cleared, clear the flag once it's filled again (admin2#34).
		const err = blueprint ? validateFieldAt(blueprint.fields, path, newData) : null;
		if (err) {
			validationErrors = { ...validationErrors, [path]: err };
		} else if (validationErrors[path]) {
			const { [path]: _cleared, ...rest } = validationErrors;
			validationErrors = rest;
		}
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

		// Block the save if any required field is empty (admin2#30); flag inline.
		validationErrors = blueprint ? checkRequiredOrToast(blueprint.fields, configData) : {};
		if (Object.keys(validationErrors).length > 0) {
			scrollToFirstError();
			return;
		}

		saving = true;
		error = '';

		try {
			const cleanData = stripRedacted(configData);
			const result = await saveConfig(scope, cleanData, etag);
			configData = result.data;
			originalJson = stableJson(result.data);
			etag = result.etag;
			overrides = result.overrides;
			fallback = result.fallback;
			await formCommit.emit();
			toast.success(i18n.t('ADMIN_NEXT.CONFIG.CONFIGURATION_SAVED_SUCCESSFULLY'));
		} catch (err: unknown) {
			if (err instanceof ApiRequestError) {
				if (err.status === 409) {
					toast.error(i18n.t('ADMIN_NEXT.CONFIG.CONFIGURATION_WAS_MODIFIED_ELSEWHERE'));
					return;
				}
				// 422: the API names each offending field. Map them onto the form
				// for inline display and call them out in the toast, so a single
				// pre-existing bad value (e.g. a migrated system.yaml setting) is
				// identifiable instead of a generic "validation failed"
				// (getgrav/grav#4176).
				const fieldErrors = err.error.errors;
				if (err.status === 422 && Array.isArray(fieldErrors) && fieldErrors.length > 0) {
					validationErrors = fieldErrors.reduce<Record<string, string>>((acc, fe) => {
						acc[fe.field] = fe.message;
						return acc;
					}, {});
					scrollToFirstError();
					toast.error(
						i18n.t('ADMIN_NEXT.CONFIG.VALIDATION_FAILED_FOR_FIELDS', {
							fields: fieldErrors.map((fe) => fe.field).join(', ')
						})
					);
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

	// --- Config override revert (see docs/config-overrides-revert.md) ---

	function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
		const parts = path.split('.');
		let cur: Record<string, unknown> = obj;
		for (let i = 0; i < parts.length - 1; i++) {
			if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
			cur = cur[parts[i]] as Record<string, unknown>;
		}
		cur[parts[parts.length - 1]] = value;
	}

	function getPath(obj: Record<string, unknown>, path: string): unknown {
		let cur: unknown = obj;
		for (const part of path.split('.')) {
			if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
			cur = (cur as Record<string, unknown>)[part];
		}
		return cur;
	}

	function handleRevertError(err: unknown) {
		const status = err && typeof err === 'object' && 'status' in err ? (err as { status: number }).status : 0;
		toast.error(
			status === 409
				? i18n.t('ADMIN_NEXT.CONFIG.CONFIGURATION_WAS_MODIFIED_ELSEWHERE')
				: i18n.t('ADMIN_NEXT.CONFIG.OVERRIDE.REVERT_FAILED')
		);
	}

	async function revertField(path: string) {
		if (!canSave || reverting) return;
		reverting = true;
		try {
			const result = await revertConfig(scope, { keys: [path] }, etag);
			// Update only the reverted field, so concurrent edits elsewhere survive.
			const newVal = getPath(result.data, path);
			handleBlueprintChange(path, newVal);
			const orig = JSON.parse(originalJson);
			setPath(orig, path, newVal);
			originalJson = stableJson(orig);
			etag = result.etag;
			overrides = result.overrides;
			fallback = result.fallback;
			toast.success(i18n.t('ADMIN_NEXT.CONFIG.OVERRIDE.REVERTED'));
		} catch (err: unknown) {
			handleRevertError(err);
		} finally {
			reverting = false;
		}
	}

	async function resetOverrides() {
		showResetModal = false;
		if (!canSave || reverting) return;
		reverting = true;
		try {
			const result = await revertConfig(scope, { reset: true }, etag);
			configData = result.data;
			originalJson = stableJson(result.data);
			etag = result.etag;
			overrides = result.overrides;
			fallback = result.fallback;
			toast.success(i18n.t('ADMIN_NEXT.CONFIG.OVERRIDE.RESET_DONE'));
		} catch (err: unknown) {
			handleRevertError(err);
		} finally {
			reverting = false;
		}
	}

	setContext('configOverrides', {
		isOverridden: (path: string) => overrides.includes(path),
		getFallback: (path: string) => fallback[path],
		revert: (path: string) => revertField(path),
		get canRevert() { return canSave; },
	} satisfies ConfigOverridesCtx);

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
		formName: i18n.t('ADMIN_NEXT.TOASTS.FORM_LABEL.CONFIGURATION'),
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
						<h1 class="font-semibold tracking-tight text-foreground transition-[font-size] duration-200 {scrolled ? 'text-sm' : 'text-xl'}">{scrolled ? i18n.t('ADMIN_NEXT.CONFIG.TITLE_SCROLLED', { scope: scopeTitle(scope) }) : i18n.t('ADMIN_NEXT.CONFIG.TITLE')}</h1>
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
							{#if overrides.length > 0 && canSave}
								<Button
									variant="outline"
									size="sm"
									onclick={() => (showResetModal = true)}
									disabled={loading || saving || reverting}
									title={i18n.t('ADMIN_NEXT.CONFIG.OVERRIDE.RESET_TOOLTIP')}
								>
									<RotateCcw size={14} />
									{i18n.t('ADMIN_NEXT.CONFIG.OVERRIDE.RESET_BUTTON')}
								</Button>
							{/if}
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
								class="h-8 w-full rounded-md border border-input bg-transparent ps-9 pe-8 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
		{#if scope === 'security' && !filter}
			<!-- One profile control over the security.twig_content keys; the raw
			     process_enabled/editor_enabled toggles stay in the form below as
			     the advanced view (and the Custom escape hatch). -->
			<div class="mb-4">
				<TwigContentProfile data={configData} onchange={handleBlueprintChange} />
			</div>
		{/if}
		<BlueprintForm
			fields={blueprint.fields}
			data={configData}
			onchange={handleBlueprintChange}
			oncommit={autoSave.oncommit}
			errors={validationErrors}
			{filter}
		/>
	{:else if !error}
		<div class="py-20 text-center text-sm text-muted-foreground">
			{i18n.t('ADMIN_NEXT.CONFIG.NO_CONFIGURATION_BLUEPRINT_AVAILABLE')}
		</div>
	{/if}
	</div>
</div>

<UnsavedChangesModal {guard} />

<ConfirmModal
	open={showResetModal}
	title={i18n.t('ADMIN_NEXT.CONFIG.OVERRIDE.RESET_TITLE')}
	message={i18n.t('ADMIN_NEXT.CONFIG.OVERRIDE.RESET_MESSAGE', { scope: scopeTitle(scope) })}
	confirmLabel={i18n.t('ADMIN_NEXT.CONFIG.OVERRIDE.RESET_CONFIRM')}
	cancelLabel={i18n.t('ADMIN_NEXT.CANCEL')}
	onconfirm={resetOverrides}
	oncancel={() => (showResetModal = false)}
/>
