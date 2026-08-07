<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { auth } from '$lib/stores/auth.svelte';
	import {
		getDirectories,
		createObject,
		getFlexBlueprint,
		type FlexDirectoryInfo,
	} from '$lib/api/endpoints/flexObjects';
	import type { BlueprintSchema, BlueprintField } from '$lib/api/endpoints/blueprints';
	import BlueprintForm from '$lib/components/blueprint/BlueprintForm.svelte';
	import { checkRequiredOrToast, scrollToFirstError, validateFieldAt, stableJson } from '$lib/utils/blueprint-validation';
	import { renderFlexTitle } from '$lib/utils/flex-title';
	import { Button } from '$lib/components/ui/button';
	import StickyHeader from '$lib/components/ui/StickyHeader.svelte';
	import { toast } from 'svelte-sonner';
	import { Loader2, Save, Plus } from 'lucide-svelte';
	import DirectionalIcon from '$lib/components/ui/DirectionalIcon.svelte';

	const type = $derived(page.params.type ?? '');

	let directory = $state<FlexDirectoryInfo | null>(null);
	let blueprint = $state<BlueprintSchema | null>(null);
	let loading = $state(true);
	let saving = $state(false);
	let error = $state('');

	let configData = $state<Record<string, unknown>>({});
	let validationErrors = $state<Record<string, string>>({});

	// Read save-redirect from the custom field value
	const afterSave = $derived((configData._post_entries_save as string) ?? 'edit');

	// Title for the create screen, from the directory's edit.title.template.
	// Rendered against a null object so every `?? 'fallback'` branch is taken —
	// that branch exists chiefly for this screen (an existing object's field
	// normally has a value, making the fallback unreachable). A template with no
	// usable fallbacks renders to nothing, so we drop back to "New {Type}".
	const newTitle = $derived.by(() => {
		const template = directory?.edit?.title?.template;
		const fallbackTitle = `New ${directory?.title ?? type}`;
		if (!template) return fallbackTitle;
		const rendered = renderFlexTitle(template, null).trim();
		return rendered || fallbackTitle;
	});

	/**
	 * Write a value at a dotted path, creating the intermediate objects.
	 */
	function setAtPath(target: Record<string, unknown>, path: string, value: unknown): void {
		const parts = path.split('.');
		const last = parts.pop();
		if (!last) return;

		let node = target;
		for (const part of parts) {
			const existing = node[part];
			if (typeof existing !== 'object' || existing === null || Array.isArray(existing)) {
				node[part] = {};
			}
			node = node[part] as Record<string, unknown>;
		}
		node[last] = value;
	}

	/**
	 * Collect blueprint defaults into the nested shape the form and the API use.
	 *
	 * Field names arrive as full dotted paths, so a default has to be written at
	 * its path rather than under the last segment alone. Keying by the last
	 * segment let a nested field overwrite a top-level one of the same name, and
	 * scattered every nested name across the top level of the record.
	 *
	 * Children of a `list` are skipped: their defaults belong to rows the user
	 * adds later, not to an empty collection. ListField seeds those itself.
	 */
	function extractDefaults(fields: BlueprintField[]): Record<string, unknown> {
		const defaults: Record<string, unknown> = {};

		function walk(list: BlueprintField[]): void {
			for (const field of list) {
				if (field.default !== undefined) {
					setAtPath(defaults, field.name, field.default);
				}
				if (field.fields && field.type !== 'list') {
					walk(field.fields);
				}
			}
		}

		walk(fields);
		return defaults;
	}

	async function loadData() {
		loading = true;
		error = '';
		try {
			const [blueprintResult, dirs] = await Promise.all([
				getFlexBlueprint(type),
				getDirectories().catch(() => [] as FlexDirectoryInfo[]),
			]);

			blueprint = blueprintResult;
			directory = dirs.find((d) => d.type === type) ?? null;
			configData = extractDefaults(blueprintResult.fields);
		} catch {
			error = `Failed to load blueprint for '${type}'.`;
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

	async function handleCreate() {
		// Block the create if any required field is empty (admin2#30).
		validationErrors = blueprint ? checkRequiredOrToast(blueprint.fields, configData) : {};
		if (Object.keys(validationErrors).length > 0) {
			scrollToFirstError();
			return;
		}

		saving = true;
		try {
			// Strip UI-only fields before sending to API
			const { _post_entries_save, ...saveData } = configData;
			const result = await createObject(type, saveData);
			toast.success(i18n.t('ADMIN_NEXT.FLEX_OBJECTS.NEW.OBJECT_CREATED'));

			if (afterSave === 'create-new') {
				// Reset form for another new item
				configData = blueprint ? extractDefaults(blueprint.fields) : {};
			} else if (afterSave === 'list') {
				goto(`${base}/flex-objects/${type}`);
			} else {
				// 'edit' — go to edit page
				goto(`${base}/flex-objects/${type}/${result.key}`);
			}
		} catch (err: unknown) {
			const message =
				err && typeof err === 'object' && 'message' in err
					? (err as { message: string }).message
					: 'Failed to create object';
			toast.error(message);
		} finally {
			saving = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 's') {
			e.preventDefault();
			if (!saving) handleCreate();
		}
	}

	$effect(() => {
		type;
		loadData();
	});
</script>

<svelte:head>
	<title>{newTitle} — Grav Admin</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="flex h-full flex-col">
	<!-- Header -->
	<StickyHeader>
		{#snippet children({ scrolled })}
			<div class="px-6 transition-[padding] duration-200 {scrolled ? 'py-2' : 'pt-6 pb-3'}">
				<div class="flex items-center justify-between gap-4 {scrolled ? 'min-h-6' : 'min-h-8'}">
					<div class="flex items-center gap-3">
						<button
							type="button"
							class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
							onclick={() => goto(`${base}/flex-objects/${type}`)}
						>
							<DirectionalIcon name="arrow-back" size={16} />
						</button>
						{#if !scrolled}
							<div
								class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"
							>
								<Plus size={16} />
							</div>
						{/if}
						<h1 class="font-semibold text-foreground transition-[font-size] duration-200 {scrolled ? 'text-sm' : 'text-lg'}">
							{newTitle}
						</h1>
					</div>

					<Button size="sm" onclick={handleCreate} disabled={saving || auth.demoMode}>
						{#if saving}
							<Loader2 size={14} class="me-1.5 animate-spin" />
						{:else}
							<Save size={14} class="me-1.5" />
						{/if}
						Create
					</Button>
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
				<p class="text-sm text-destructive">{error}</p>
				<Button
					variant="outline"
					size="sm"
					class="mt-3"
					onclick={() => goto(`${base}/flex-objects/${type}`)}
				>
					{i18n.t('ADMIN_NEXT.FLEX_OBJECTS.NEW.BACK_TO_LIST')}
				</Button>
			</div>
		</div>
	{:else if blueprint}
		<div class="flex-1 overflow-y-auto">
			<div class="space-y-6 px-6 py-6">
				<BlueprintForm
					fields={blueprint.fields}
					data={configData}
					onchange={handleBlueprintChange}
					errors={validationErrors}
				/>
			</div>
		</div>
	{/if}
</div>
