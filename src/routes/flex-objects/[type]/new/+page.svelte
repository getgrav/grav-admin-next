<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import {
		getDirectories,
		createObject,
		getFlexBlueprint,
		type FlexDirectoryInfo,
	} from '$lib/api/endpoints/flexObjects';
	import type { BlueprintSchema, BlueprintField } from '$lib/api/endpoints/blueprints';
	import BlueprintForm from '$lib/components/blueprint/BlueprintForm.svelte';
	import { Button } from '$lib/components/ui/button';
	import StickyHeader from '$lib/components/ui/StickyHeader.svelte';
	import { toast } from 'svelte-sonner';
	import { ArrowLeft, Loader2, Save, Plus } from 'lucide-svelte';

	const type = $derived(page.params.type ?? '');

	let directory = $state<FlexDirectoryInfo | null>(null);
	let blueprint = $state<BlueprintSchema | null>(null);
	let loading = $state(true);
	let saving = $state(false);
	let error = $state('');

	let configData = $state<Record<string, unknown>>({});

	// Read save-redirect from the custom field value
	const afterSave = $derived((configData._post_entries_save as string) ?? 'edit');

	/**
	 * Extract default values from blueprint fields recursively.
	 */
	function extractDefaults(fields: BlueprintField[]): Record<string, unknown> {
		const defaults: Record<string, unknown> = {};
		for (const field of fields) {
			if (field.default !== undefined) {
				const name = field.name.includes('.') ? field.name.split('.').pop()! : field.name;
				defaults[name] = field.default;
			}
			if (field.fields) {
				Object.assign(defaults, extractDefaults(field.fields));
			}
		}
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
	}

	async function handleCreate() {
		saving = true;
		try {
			// Strip UI-only fields before sending to API
			const { _post_entries_save, ...saveData } = configData;
			const result = await createObject(type, saveData);
			toast.success('Object created');

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
	<title>New {directory?.title ?? type} — Grav Admin</title>
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
							<ArrowLeft size={16} />
						</button>
						{#if !scrolled}
							<div
								class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"
							>
								<Plus size={16} />
							</div>
						{/if}
						<h1 class="font-semibold text-foreground transition-[font-size] duration-200 {scrolled ? 'text-sm' : 'text-lg'}">
							New {directory?.title ?? type}
						</h1>
					</div>

					<Button size="sm" onclick={handleCreate} disabled={saving}>
						{#if saving}
							<Loader2 size={14} class="mr-1.5 animate-spin" />
						{:else}
							<Save size={14} class="mr-1.5" />
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
					Back to List
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
				/>
			</div>
		</div>
	{/if}
</div>
