<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import { canWrite } from '$lib/utils/permissions';
	import { getGroup, updateGroup, deleteGroup, type GroupInfo } from '$lib/api/endpoints/groups';
	import { getGroupBlueprint, type BlueprintSchema } from '$lib/api/endpoints/blueprints';
	import BlueprintForm from '$lib/components/blueprint/BlueprintForm.svelte';
	import { checkRequiredOrToast, scrollToFirstError, validateFieldAt, hasRequiredErrors, stableJson, pruneEmpty } from '$lib/utils/blueprint-validation';
	import PermissionsField from '$lib/components/PermissionsField.svelte';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import AccessDenied from '$lib/components/ui/AccessDenied.svelte';
	import { Button } from '$lib/components/ui/button';
	import StickyHeader from '$lib/components/ui/StickyHeader.svelte';
	import { toast } from 'svelte-sonner';
	import { Save, Loader2, Trash2, Users } from 'lucide-svelte';
	import DirectionalIcon from '$lib/components/ui/DirectionalIcon.svelte';

	const canEdit = $derived(auth.isSuperAdmin || canWrite('users'));
	const SUPPRESSED_TYPES = new Set(['permissions']);

	const name = $derived(page.params.name ?? '');

	let group = $state<GroupInfo | null>(null);
	let blueprint = $state<BlueprintSchema | null>(null);
	let etag = $state('');
	let loading = $state(true);
	let saving = $state(false);
	let deleting = $state(false);
	let confirmDeleteOpen = $state(false);
	let accessDenied = $state(false);

	let configData = $state<Record<string, unknown>>({});
	let validationErrors = $state<Record<string, string>>({});
	let originalJson = $state('{}');
	let access = $state<Record<string, unknown>>({});
	let originalAccessJson = $state('{}');

	const hasChanges = $derived(
		stableJson(configData) !== originalJson ||
		stableJson(access) !== originalAccessJson
	);

	function filterFields(fields: BlueprintSchema['fields']): BlueprintSchema['fields'] {
		return fields
			.filter((f) => !SUPPRESSED_TYPES.has(f.type))
			.map((f) => f.fields ? { ...f, fields: filterFields(f.fields) } : f);
	}

	const filteredBlueprint = $derived.by(() => {
		if (!blueprint) return null;
		return { ...blueprint, fields: filterFields(blueprint.fields) };
	});
	// Reactive validity gate: keep Save disabled while any required field is empty
	// (admin2#34). Independent of the inline error display, which stays touch/submit-gated.
	let requiredOk = $derived(!filteredBlueprint || !hasRequiredErrors(filteredBlueprint.fields, configData));

	function populateForm(g: GroupInfo) {
		configData = {
			groupname: g.groupname,
			readableName: g.readableName ?? '',
			description: g.description ?? '',
			icon: g.icon ?? '',
			enabled: g.enabled,
		};
		originalJson = stableJson(configData);
		access = structuredClone(g.access ?? {});
		originalAccessJson = stableJson(access);
	}

	async function load() {
		loading = true;
		try {
			const [groupResult, blueprintResult] = await Promise.all([
				getGroup(name),
				getGroupBlueprint().catch(() => null),
			]);
			group = groupResult.group;
			etag = groupResult.etag;
			blueprint = blueprintResult;
			populateForm(groupResult.group);
		} catch (err: unknown) {
			const status = err && typeof err === 'object' && 'status' in err ? (err as { status: number }).status : 0;
			if (status === 403) {
				accessDenied = true;
			} else {
				toast.error(i18n.t('ADMIN_NEXT.GROUPS.FAILED_TO_LOAD_GROUP', { name }));
			}
		} finally {
			loading = false;
		}
	}

	function handleBlueprintChange(path: string, value: unknown) {
		const parts = path.split('.');
		const next = { ...configData };
		let cur: Record<string, unknown> = next;
		for (let i = 0; i < parts.length - 1; i++) {
			const k = parts[i];
			if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {};
			else cur[k] = { ...(cur[k] as Record<string, unknown>) };
			cur = cur[k] as Record<string, unknown>;
		}
		cur[parts[parts.length - 1]] = value;
		configData = next;

		// Re-check this field now it's been touched: flag it if a required field was
		// cleared, clear the flag once it's filled again (admin2#34).
		const err = filteredBlueprint ? validateFieldAt(filteredBlueprint.fields, path, next) : null;
		if (err) {
			validationErrors = { ...validationErrors, [path]: err };
		} else if (validationErrors[path]) {
			const { [path]: _cleared, ...rest } = validationErrors;
			validationErrors = rest;
		}
	}

	async function handleSave() {
		// Block the save if any required field is empty (admin2#30).
		validationErrors = filteredBlueprint ? checkRequiredOrToast(filteredBlueprint.fields, configData) : {};
		if (Object.keys(validationErrors).length > 0) {
			scrollToFirstError();
			return;
		}

		saving = true;
		try {
			const body: Record<string, unknown> = { ...configData, access: pruneEmpty(access) };
			delete body.groupname;
			const result = await updateGroup(name, body, etag);
			group = result.group;
			etag = result.etag;
			populateForm(result.group);
			toast.success(i18n.t('ADMIN_NEXT.GROUPS.GROUP_SAVED', { name }));
		} catch (err: unknown) {
			const status = err && typeof err === 'object' && 'status' in err ? (err as { status: number }).status : 0;
			if (status === 409) {
				toast.error(i18n.t('ADMIN_NEXT.GROUPS.GROUP_MODIFIED_ELSEWHERE'));
			} else {
				toast.error(i18n.t('ADMIN_NEXT.GROUPS.FAILED_TO_SAVE_GROUP'));
			}
		} finally {
			saving = false;
		}
	}

	async function handleDelete() {
		confirmDeleteOpen = false;
		deleting = true;
		try {
			await deleteGroup(name);
			toast.success(i18n.t('ADMIN_NEXT.GROUPS.GROUP_DELETED', { name }));
			goto(`${base}/users/groups`);
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.GROUPS.GROUP_DELETE_FAILED', { name }));
		} finally {
			deleting = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 's') {
			e.preventDefault();
			if (hasChanges && !saving) handleSave();
		}
	}

	onMount(() => { load(); });
</script>

<svelte:head>
	<title>{i18n.t('ADMIN_NEXT.GROUPS.GROUP_PAGE_TITLE', { name })}</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

{#if accessDenied}
	<AccessDenied />
{:else}
	<div class="flex h-full flex-col">
		<StickyHeader>
			{#snippet children({ scrolled })}
				<div class="flex items-center justify-between px-6 transition-[padding] duration-200 {scrolled ? 'py-2' : 'pt-6 pb-3'}">
					<div class="flex items-center gap-2 min-w-0">
						<Users size={scrolled ? 16 : 20} class="shrink-0 text-muted-foreground" />
						<div class="min-w-0">
							<h1 class="truncate font-semibold tracking-tight text-foreground transition-[font-size] duration-200 {scrolled ? 'text-sm' : 'text-xl'}">
								{group?.readableName || name}
							</h1>
							{#if !scrolled}
								<p class="mt-0.5 truncate text-xs text-muted-foreground">{name}</p>
							{/if}
						</div>
					</div>
					<div class="flex items-center gap-2">
						<Button variant="outline" size="sm" onclick={() => goto(`${base}/users/groups`)}>
							<DirectionalIcon name="chevron-back" size={14} />
							{i18n.t('ADMIN_NEXT.GROUPS.BACK_TO_GROUPS')}
						</Button>
						{#if canEdit}
							<Button variant="outline" size="sm" disabled={deleting} onclick={() => confirmDeleteOpen = true}>
								<Trash2 size={14} />
								{i18n.t('ADMIN_NEXT.DELETE')}
							</Button>
							<Button size="sm" disabled={!hasChanges || saving || !requiredOk} onclick={handleSave}>
								{#if saving}
									<Loader2 size={14} class="animate-spin" />
								{:else}
									<Save size={14} />
								{/if}
								{i18n.t('ADMIN_NEXT.SAVE')}
							</Button>
						{/if}
					</div>
				</div>
			{/snippet}
		</StickyHeader>

		{#if loading}
			<div class="flex flex-1 items-center justify-center">
				<Loader2 size={24} class="animate-spin text-muted-foreground" />
			</div>
		{:else if group && filteredBlueprint}
			<div class="flex-1 overflow-y-auto">
				<div class="mx-auto max-w-3xl px-6 py-6 space-y-6">
					<BlueprintForm
						fields={filteredBlueprint.fields}
						data={configData}
						onchange={handleBlueprintChange}
						errors={validationErrors}
					/>
					<div class="rounded-lg border border-border bg-card p-4">
						<h2 class="mb-3 text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.USERS.PERMISSIONS')}</h2>
						<PermissionsField value={access} onchange={(v) => access = v} />
					</div>
				</div>
			</div>
		{/if}
	</div>
{/if}

<ConfirmModal
	open={confirmDeleteOpen}
	title={i18n.t('ADMIN_NEXT.GROUPS.DELETE_GROUP')}
	message={i18n.t('ADMIN_NEXT.GROUPS.CONFIRM_DELETE_GROUP', { name })}
	confirmLabel={i18n.t('ADMIN_NEXT.DELETE')}
	variant="destructive"
	onconfirm={handleDelete}
	oncancel={() => { confirmDeleteOpen = false; }}
/>
