<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import {
		getPluginPageDefinition,
		getPluginPageBlueprint,
		getPluginPageData,
		savePluginPageData,
		type PluginPageDefinition,
		type PluginPageAction,
	} from '$lib/api/endpoints/pluginPages';
	import type { BlueprintSchema } from '$lib/api/endpoints/blueprints';
	import BlueprintForm from '$lib/components/blueprint/BlueprintForm.svelte';
	import PluginPageComponent from '$lib/components/plugin-page/PluginPageComponent.svelte';
	import { Button } from '$lib/components/ui/button';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import { toast } from 'svelte-sonner';
	import { auth } from '$lib/stores/auth.svelte';
	import { customFieldRegistry } from '$lib/stores/customFields.svelte';
	import { getPlugin } from '$lib/api/endpoints/gpm';
	import { prefs } from '$lib/stores/preferences.svelte';
	import { createAutoSaveManager } from '$lib/utils/auto-save.svelte';
	import { createUnsavedGuard } from '$lib/utils/unsaved-guard.svelte';
	import { ArrowLeft, Loader2, AlertCircle, Save, Download, Upload, Undo2 } from 'lucide-svelte';

	const slug = $derived(page.params.slug ?? '');

	let definition = $state<PluginPageDefinition | null>(null);
	let blueprint = $state<BlueprintSchema | null>(null);
	let formData = $state<Record<string, unknown>>({});
	let originalJson = $state('{}');
	let loading = $state(true);
	let saving = $state(false);
	let error = $state('');
	let actionExecuting = $state<string | null>(null);

	let hasChanges = $derived(JSON.stringify(formData) !== originalJson);

	async function loadPage() {
		loading = true;
		error = '';

		try {
			const def = await getPluginPageDefinition(slug);
			definition = def;

			// Register custom fields if the plugin provides them
			try {
				const pluginInfo = await getPlugin(slug);
				if (pluginInfo.custom_fields) {
					customFieldRegistry.register(slug, pluginInfo.custom_fields as Record<string, string>);
				}
			} catch {
				// Non-critical — plugin info may not be available
			}

			if (def.page_type === 'blueprint' && def.blueprint) {
				const [bp, data] = await Promise.all([
					getPluginPageBlueprint(slug, def.blueprint),
					def.data_endpoint ? getPluginPageData(def.data_endpoint) : Promise.resolve({}),
				]);
				blueprint = bp;
				formData = data;
				originalJson = JSON.stringify(data);
			}
		} catch (err: unknown) {
			const detail = err instanceof Error ? err.message : String(err);
			error = `Failed to load plugin page: ${detail}`;
		} finally {
			loading = false;
		}
	}

	function handleBlueprintChange(path: string, value: unknown) {
		const parts = path.split('.');
		const newData = { ...formData };
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
		formData = newData;
	}

	async function handleSave() {
		if (!definition?.save_endpoint) return;
		saving = true;
		try {
			await savePluginPageData(definition.save_endpoint, formData);
			toast.success(`${definition.title ?? slug} saved`);
			// Reload page so all components (including web components) re-fetch
			await loadPage();
		} catch (err: unknown) {
			const detail = err instanceof Error ? err.message : 'Save failed';
			toast.error(detail);
		} finally {
			saving = false;
		}
	}

	let fileInput = $state<HTMLInputElement | null>(null);

	function handleImportClick() {
		fileInput?.click();
	}

	async function handleFileSelected(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file || !definition) return;

		const importAction = definition.actions?.find(a => a.upload);
		if (!importAction?.endpoint) return;

		actionExecuting = importAction.id;
		try {
			const fd = new FormData();
			fd.append('file', file);

			const baseUrl = `${auth.serverUrl}${auth.apiPrefix}`;
			const headers: Record<string, string> = {};
			if (auth.accessToken) headers['Authorization'] = `Bearer ${auth.accessToken}`;
			if (auth.environment) headers['X-Grav-Environment'] = auth.environment;

			const resp = await fetch(`${baseUrl}${importAction.endpoint}`, {
				method: 'POST',
				headers,
				body: fd,
			});
			const result = await resp.json();
			if (resp.ok) {
				toast.success(result.data?.message ?? result.message ?? 'Import successful');
				// Reload entire page so all components (including web components) re-fetch
				await loadPage();
			} else {
				toast.error(result.detail ?? result.message ?? 'Import failed');
			}
		} catch (err: unknown) {
			const detail = err instanceof Error ? err.message : 'Import failed';
			toast.error(detail);
		} finally {
			actionExecuting = null;
			// Reset so the same file can be re-selected
			input.value = '';
		}
	}

	async function executeAction(action: PluginPageAction) {
		if (!action.endpoint) return;

		if (action.confirm && !confirm(action.confirm)) return;

		// Download actions
		if (action.download) {
			const baseUrl = `${auth.serverUrl}${auth.apiPrefix}`;
			const url = `${baseUrl}${action.endpoint}`;
			const headers: Record<string, string> = {};
			if (auth.accessToken) headers['Authorization'] = `Bearer ${auth.accessToken}`;
			if (auth.environment) headers['X-Grav-Environment'] = auth.environment;

			try {
				const resp = await fetch(url, { headers });
				if (!resp.ok) throw new Error(resp.statusText);
				const blob = await resp.blob();
				const a = document.createElement('a');
				a.href = URL.createObjectURL(blob);
				const cd = resp.headers.get('Content-Disposition');
				a.download = cd?.match(/filename="?(.+?)"?$/)?.[1] ?? `${slug}-export`;
				document.body.appendChild(a);
				a.click();
				a.remove();
				URL.revokeObjectURL(a.href);
			} catch (err: unknown) {
				const detail = err instanceof Error ? err.message : 'Download failed';
				toast.error(detail);
			}
			return;
		}

		// Upload actions
		if (action.upload) {
			const input = document.createElement('input');
			input.type = 'file';
			input.accept = '.yaml,.yml';
			input.style.display = 'none';
			document.body.appendChild(input);
			input.onchange = async () => {
				const file = input.files?.[0];
				input.remove();
				if (!file) return;

				actionExecuting = action.id;
				try {
					const fd = new FormData();
					fd.append('file', file);

					const baseUrl = `${auth.serverUrl}${auth.apiPrefix}`;
					const headers: Record<string, string> = {};
					if (auth.accessToken) headers['Authorization'] = `Bearer ${auth.accessToken}`;
					if (auth.environment) headers['X-Grav-Environment'] = auth.environment;

					const resp = await fetch(`${baseUrl}${action.endpoint}`, {
						method: 'POST',
						headers,
						body: fd,
					});
					const result = await resp.json();
					if (resp.ok) {
						toast.success(result.data?.message ?? result.message ?? 'Import successful');
						// Refresh data
						if (definition?.data_endpoint) {
							const fresh = await getPluginPageData(definition.data_endpoint);
							formData = fresh;
							originalJson = JSON.stringify(fresh);
						}
					} else {
						toast.error(result.detail ?? result.message ?? 'Import failed');
					}
				} catch (err: unknown) {
					const detail = err instanceof Error ? err.message : 'Import failed';
					toast.error(detail);
				} finally {
					actionExecuting = null;
				}
			};
			input.click();
			return;
		}

		// Standard actions (POST/PUT/DELETE)
		actionExecuting = action.id;
		try {
			const baseUrl = `${auth.serverUrl}${auth.apiPrefix}`;
			const headers: Record<string, string> = {
				'Content-Type': 'application/json',
				Accept: 'application/json',
			};
			if (auth.accessToken) headers['Authorization'] = `Bearer ${auth.accessToken}`;
			if (auth.environment) headers['X-Grav-Environment'] = auth.environment;

			const resp = await fetch(`${baseUrl}${action.endpoint}`, {
				method: action.method ?? 'POST',
				headers,
			});
			const result = await resp.json();
			if (resp.ok) {
				toast.success(result.message ?? 'Action completed');
			} else {
				toast.error(result.detail ?? result.message ?? 'Action failed');
			}
		} catch (err: unknown) {
			const detail = err instanceof Error ? err.message : 'Action failed';
			toast.error(detail);
		} finally {
			actionExecuting = null;
		}
	}

	function getActionIcon(action: PluginPageAction) {
		if (action.download) return Download;
		if (action.upload) return Upload;
		if (action.primary) return Save;
		return null;
	}

	function handleKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 's') {
			e.preventDefault();
			prefs.autoSaveEnabled ? autoSave.forceSave() : (hasChanges && !saving && definition?.save_endpoint && handleSave());
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
			let current: unknown = formData;
			for (const part of parts) {
				if (current === null || current === undefined || typeof current !== 'object') return undefined;
				current = (current as Record<string, unknown>)[part];
			}
			return current;
		},
		applyChange: handleBlueprintChange,
		formName: 'Plugin Page',
	});

	$effect(() => {
		slug; // track
		autoSave.reset();
		loadPage();
	});
</script>

<svelte:head>
	<title>{definition?.title ?? slug} — Grav Admin</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="flex h-full flex-col">
	<!-- Header -->
	<div class="flex items-center justify-between border-b border-border px-6 py-3">
		<div class="flex items-center gap-3">
			<button
				type="button"
				class="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				onclick={() => goto(`${base}/`)}
			>
				<ArrowLeft size={16} />
			</button>
			{#if definition}
				<div class="flex items-center gap-2.5">
					{#if definition.icon}
						<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
							<i class="fa-solid {definition.icon.startsWith('fa-') ? definition.icon : 'fa-' + definition.icon} text-sm"></i>
						</div>
					{/if}
					<h1 class="text-lg font-semibold text-foreground">{definition.title}</h1>
				</div>
			{/if}
		</div>

		<div class="flex items-center gap-2">
			{#if prefs.autoSaveEnabled && prefs.autoSaveToolbarUndo && autoSave.canUndo}
				<Button variant="outline" size="sm" onclick={() => autoSave.undo()}>
					<Undo2 size={14} />
					Undo
				</Button>
			{/if}
			{#if definition?.actions}
				{#each definition.actions as action (action.id)}
					{#if action.primary}
						<!-- Primary action (Save) -->
						<Button
							size="sm"
							onclick={() => action.primary ? handleSave() : executeAction(action)}
							disabled={action.primary ? (!hasChanges || saving) : actionExecuting === action.id}
						>
							{#if (action.primary && saving) || actionExecuting === action.id}
								<Loader2 size={14} class="mr-1.5 animate-spin" />
							{:else}
								{@const Icon = getActionIcon(action)}
								{#if Icon}
									<Icon size={14} class="mr-1.5" />
								{:else if action.icon}
									<i class="fa-solid {action.icon.startsWith('fa-') ? action.icon : 'fa-' + action.icon} mr-1.5 text-xs"></i>
								{/if}
							{/if}
							{action.label}
						</Button>
					{:else}
						<Button
							variant="outline"
							size="sm"
							onclick={() => action.upload ? handleImportClick() : executeAction(action)}
							disabled={actionExecuting === action.id}
						>
							{#if actionExecuting === action.id}
								<Loader2 size={14} class="mr-1.5 animate-spin" />
							{:else}
								{@const Icon = getActionIcon(action)}
								{#if Icon}
									<Icon size={14} class="mr-1.5" />
								{:else if action.icon}
									<i class="fa-solid {action.icon.startsWith('fa-') ? action.icon : 'fa-' + action.icon} mr-1.5 text-xs"></i>
								{/if}
							{/if}
							{action.label}
						</Button>
					{/if}
				{/each}
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
				<Button variant="outline" size="sm" class="mt-3" onclick={() => goto(`${base}/`)}>
					Back to Dashboard
				</Button>
			</div>
		</div>
	{:else if definition}
		<div class="flex-1 overflow-y-auto">
			<div class="space-y-6 px-6 py-6">
				{#if definition.page_type === 'blueprint' && blueprint}
					<BlueprintForm
						fields={blueprint.fields}
						data={formData}
						onchange={handleBlueprintChange}
						oncommit={autoSave.oncommit}
					/>
				{:else if definition.page_type === 'component'}
					<PluginPageComponent slug={slug} />
				{:else}
					<div class="rounded-xl border border-dashed border-border p-8 text-center">
						<p class="text-sm text-muted-foreground">
							No content available for this plugin page.
						</p>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<!-- Hidden file input for import -->
<input
	bind:this={fileInput}
	type="file"
	accept=".yaml,.yml"
	class="hidden"
	onchange={handleFileSelected}
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
