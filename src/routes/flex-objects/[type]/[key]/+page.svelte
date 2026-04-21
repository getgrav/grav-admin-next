<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import {
		getObject,
		getDirectories,
		updateObject,
		deleteObject,
		getFlexBlueprint,
		type FlexDirectoryInfo,
		type FlexObject,
	} from '$lib/api/endpoints/flexObjects';
	import type { BlueprintSchema } from '$lib/api/endpoints/blueprints';
	import BlueprintForm from '$lib/components/blueprint/BlueprintForm.svelte';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import UnsavedIndicator from '$lib/components/ui/UnsavedIndicator.svelte';
	import { Button } from '$lib/components/ui/button';
	import StickyHeader from '$lib/components/ui/StickyHeader.svelte';
	import { toast } from 'svelte-sonner';
	import { prefs } from '$lib/stores/preferences.svelte';
	import { createAutoSaveManager } from '$lib/utils/auto-save.svelte';
	import { createUnsavedGuard } from '$lib/utils/unsaved-guard.svelte';
	import { invalidations } from '$lib/stores/invalidation.svelte';
	import { onMount } from 'svelte';
	import { Save, ArrowLeft, Loader2, AlertCircle, Trash2, Undo2 } from 'lucide-svelte';

	const type = $derived(page.params.type ?? '');
	const key = $derived(page.params.key ?? '');

	let directory = $state<FlexDirectoryInfo | null>(null);
	let object = $state<FlexObject | null>(null);
	let blueprint = $state<BlueprintSchema | null>(null);
	let etag = $state('');
	let loading = $state(true);
	let saving = $state(false);
	let deleting = $state(false);
	let error = $state('');
	let confirmDeleteOpen = $state(false);

	let configData = $state<Record<string, unknown>>({});
	let originalJson = $state('{}');

	const hasChanges = $derived(JSON.stringify(configData) !== originalJson);

	// Read save-redirect from the custom field value
	const afterSave = $derived((configData._post_entries_save as string) ?? 'edit');

	/**
	 * Render edit title from the directory's edit.title.template config.
	 */
	const editTitle = $derived.by(() => {
		const template = directory?.edit?.title?.template;
		if (!template || !object) return directory?.title ?? type;
		return template.replace(
			/\{\{\s*object\.(\w+)\s*(?:\?\?\s*'([^']*)')?\s*\}\}/g,
			(_, field: string, fallback: string) => String(object![field] ?? fallback ?? ''),
		);
	});

	function populateForm(obj: FlexObject) {
		const { key: _key, ...rest } = obj;
		configData = structuredClone(rest) as Record<string, unknown>;
		originalJson = JSON.stringify(configData);
	}

	async function loadData() {
		loading = true;
		error = '';
		try {
			const [objectResult, blueprintResult, dirs] = await Promise.all([
				getObject(type, key),
				getFlexBlueprint(type).catch(() => null),
				getDirectories().catch(() => [] as FlexDirectoryInfo[]),
			]);

			object = objectResult.object;
			etag = objectResult.etag;
			blueprint = blueprintResult;
			directory = dirs.find((d) => d.type === type) ?? null;
			populateForm(objectResult.object);
		} catch {
			error = `Failed to load object '${key}' from '${type}'.`;
		} finally {
			loading = false;
		}
	}

	function handleBlueprintChange(path: string, value: unknown) {
		const parts = path.split('.');
		const newData = { ...configData };
		let current: Record<string, unknown> = newData;

		for (let i = 0; i < parts.length - 1; i++) {
			const k = parts[i];
			if (typeof current[k] !== 'object' || current[k] === null) {
				current[k] = {};
			} else {
				current[k] = { ...(current[k] as Record<string, unknown>) };
			}
			current = current[k] as Record<string, unknown>;
		}
		current[parts[parts.length - 1]] = value;
		configData = newData;
	}

	async function handleSave() {
		saving = true;
		try {
			// Strip UI-only fields before sending to API
			const { _post_entries_save, ...saveData } = configData;
			const result = await updateObject(type, key, saveData, etag);
			object = result.object;
			etag = result.etag;
			populateForm(result.object);
			toast.success('Saved');

			if (afterSave === 'list') {
				goto(`${base}/flex-objects/${type}`);
			}
		} catch (err: unknown) {
			if (
				err &&
				typeof err === 'object' &&
				'status' in err &&
				(err as { status: number }).status === 409
			) {
				toast.error('Object was modified elsewhere. Please reload.');
			} else {
				toast.error('Failed to save.');
			}
		} finally {
			saving = false;
		}
	}

	async function confirmDelete() {
		confirmDeleteOpen = false;
		deleting = true;
		try {
			await deleteObject(type, key);
			toast.success('Object deleted');
			goto(`${base}/flex-objects/${type}`);
		} catch {
			toast.error('Failed to delete object');
		} finally {
			deleting = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 's') {
			e.preventDefault();
			prefs.autoSaveEnabled ? autoSave.forceSave() : hasChanges && !saving && handleSave();
		}
		if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey && prefs.autoSaveEnabled) {
			const tag = (document.activeElement?.tagName ?? '').toLowerCase();
			const isEditable =
				tag === 'input' ||
				tag === 'textarea' ||
				(document.activeElement as HTMLElement)?.isContentEditable;
			if (!isEditable) {
				e.preventDefault();
				autoSave.undo();
			}
		}
	}

	const guard = createUnsavedGuard(() => {
		if (prefs.autoSaveEnabled) {
			return hasChanges || autoSave.saving || autoSave.undoStack.some((e) => !e.savedToServer);
		}
		return hasChanges;
	});

	const autoSave = createAutoSaveManager({
		save: handleSave,
		getValue: (path: string) => {
			const parts = path.split('.');
			let current: unknown = configData;
			for (const part of parts) {
				if (current === null || current === undefined || typeof current !== 'object')
					return undefined;
				current = (current as Record<string, unknown>)[part];
			}
			return current;
		},
		applyChange: handleBlueprintChange,
		formName: 'Flex Object',
	});

	$effect(() => {
		type;
		key;
		autoSave.reset();
		loadData();
	});

	onMount(() => {
		const unsub = invalidations.subscribe(`flex-objects:${type}:update:${key}`, () => {
			if (!hasChanges) loadData();
			else toast.info('Object changed elsewhere — save to overwrite or reload');
		}, {
			// Skip self-echo: our own PATCH emits this same event before handleSave
			// has cleared hasChanges, which would otherwise toast on every save.
			dirtyGuard: () => saving || autoSave.saving,
		});
		return () => {
			unsub();
		};
	});
</script>

<svelte:head>
	<title>{editTitle} — {directory?.title ?? type} — Grav Admin</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="flex h-full flex-col">
	<!-- Header -->
	<StickyHeader>
		{#snippet children({ scrolled })}
			<div class="px-6 transition-[padding] duration-200 {scrolled ? 'py-2' : 'pt-6 pb-3'}">
				<div class="flex items-center justify-between gap-4 {scrolled ? 'min-h-6' : 'min-h-8'}">
					<div class="flex min-w-0 items-center gap-3">
						<button
							type="button"
							class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
							onclick={() => goto(`${base}/flex-objects/${type}`)}
						>
							<ArrowLeft size={16} />
						</button>
						<div class="min-w-0">
							<h1 class="truncate font-semibold text-foreground transition-[font-size] duration-200 {scrolled ? 'text-sm' : 'text-lg'}">{editTitle}</h1>
							{#if !scrolled}
								<p class="text-xs text-muted-foreground">{directory?.title ?? type}</p>
							{/if}
						</div>
					</div>

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
						<Button
							variant="destructive"
							size="sm"
							onclick={() => (confirmDeleteOpen = true)}
							disabled={deleting}
						>
							{#if deleting}
								<Loader2 size={14} class="mr-1.5 animate-spin" />
							{:else}
								<Trash2 size={14} class="mr-1.5" />
							{/if}
							Delete
						</Button>
						<Button size="sm" onclick={handleSave} disabled={!hasChanges || saving}>
							{#if saving}
								<Loader2 size={14} class="mr-1.5 animate-spin" />
							{:else}
								<Save size={14} class="mr-1.5" />
							{/if}
							Save
						</Button>
					</div>
				</div>
			</div>
		{/snippet}
	</StickyHeader>

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
				<Button
					variant="outline"
					size="sm"
					class="mt-3"
					onclick={() => goto(`${base}/flex-objects/${type}`)}
				>
					Back to List
				</Button>
			</div>
		</div>
	{:else if object && blueprint}
		<div class="flex-1 overflow-y-auto">
			<div class="space-y-6 px-6 py-6">
				<BlueprintForm
					fields={blueprint.fields}
					data={configData}
					onchange={handleBlueprintChange}
					oncommit={autoSave.oncommit}
				/>
			</div>
		</div>
	{/if}
</div>

<ConfirmModal
	open={confirmDeleteOpen}
	title="Delete Object"
	message="Are you sure you want to delete this object? This action cannot be undone."
	confirmLabel="Delete"
	variant="destructive"
	onconfirm={confirmDelete}
	oncancel={() => (confirmDeleteOpen = false)}
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
