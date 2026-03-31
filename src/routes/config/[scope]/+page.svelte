<script lang="ts">
	import { page } from '$app/state';
	import { beforeNavigate } from '$app/navigation';
	import { getConfig, saveConfig, getConfigSections } from '$lib/api/endpoints/config';
	import { getConfigBlueprint } from '$lib/api/endpoints/blueprints';
	import type { BlueprintSchema } from '$lib/api/endpoints/blueprints';
	import BlueprintForm from '$lib/components/blueprint/BlueprintForm.svelte';
	import ConfigNav from '$lib/components/config/ConfigNav.svelte';
	import ConfigInfoPage from '$lib/components/config/ConfigInfoPage.svelte';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import { Save, AlertCircle, Loader2, RefreshCw } from 'lucide-svelte';
	import { i18n } from '$lib/stores/i18n.svelte';

	const REDACTED = '********';
	const translateLabel = i18n.tMaybe;

	const scope = $derived(page.params.scope ?? 'system');
	const isInfo = $derived(scope === 'info');

	let sections = $state<string[]>(['system', 'site', 'media', 'security', 'info']);
	let blueprint = $state<BlueprintSchema | null>(null);
	let configData = $state<Record<string, unknown>>({});
	let originalJson = $state('{}');
	let etag = $state('');
	let loading = $state(true);
	let saving = $state(false);
	let error = $state('');

	let hasChanges = $derived(JSON.stringify(configData) !== originalJson);

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
			if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404) {
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
			toast.success('Configuration saved successfully');
		} catch (err: unknown) {
			if (err && typeof err === 'object' && 'status' in err) {
				const status = (err as { status: number }).status;
				if (status === 409) {
					toast.error('Configuration was modified elsewhere. Reload to see the latest changes.');
					return;
				}
			}
			if (err && typeof err === 'object' && 'message' in err) {
				toast.error((err as { message: string }).message);
			} else {
				toast.error('Failed to save configuration');
			}
		} finally {
			saving = false;
		}
	}

	async function handleReload() {
		await loadConfig();
		toast.info('Configuration reloaded');
	}

	function handleKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 's') {
			e.preventDefault();
			handleSave();
		}
	}

	// Warn about unsaved changes on navigation
	beforeNavigate(({ cancel }) => {
		if (hasChanges && !confirm('You have unsaved changes. Discard them?')) {
			cancel();
		}
	});

	// Load sections once, reload config when scope changes
	$effect(() => { loadSections(); });
	$effect(() => { scope; loadConfig(); });
</script>

<svelte:head>
	<title>Configuration: {scopeTitle(scope)} — Grav Admin</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4 p-5">
	<!-- Header -->
	<div class="flex items-center justify-between gap-4">
		<div>
			<h1 class="text-lg font-semibold text-foreground">Configuration</h1>
			<p class="text-xs text-muted-foreground">{scopeTitle(scope)}</p>
		</div>

		{#if !isInfo}
			<div class="flex shrink-0 items-center gap-2">
				{#if hasChanges}
					<span class="text-xs text-amber-500">Unsaved changes</span>
				{/if}
				<Button variant="outline" size="sm" onclick={handleReload} disabled={loading || saving}>
					<RefreshCw size={14} />
					Reload
				</Button>
				<Button size="sm" onclick={handleSave} disabled={saving || loading || !hasChanges}>
					{#if saving}
						<Loader2 size={14} class="animate-spin" />
						Saving...
					{:else}
						<Save size={14} />
						Save
					{/if}
				</Button>
			</div>
		{/if}
	</div>

	<!-- Scope navigation tabs -->
	<ConfigNav {sections} />

	{#if error}
		<div class="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950/30 dark:text-red-300">
			<AlertCircle size={16} />
			{error}
		</div>
	{/if}

	{#if loading}
		<div class="py-20 text-center text-sm text-muted-foreground">Loading configuration...</div>
	{:else if isInfo}
		<ConfigInfoPage />
	{:else if blueprint}
		<BlueprintForm
			fields={blueprint.fields}
			data={configData}
			onchange={handleBlueprintChange}
		/>
	{:else if !error}
		<div class="py-20 text-center text-sm text-muted-foreground">
			No configuration blueprint available for this scope.
		</div>
	{/if}
</div>
