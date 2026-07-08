<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import { getConfig, saveConfig } from '$lib/api/endpoints/config';
	import { getAccountsConfigBlueprint, type BlueprintSchema } from '$lib/api/endpoints/blueprints';
	import BlueprintForm from '$lib/components/blueprint/BlueprintForm.svelte';
	import { canWrite } from '$lib/utils/permissions';
	import { checkRequiredOrToast, scrollToFirstError, validateFieldAt, hasRequiredErrors, stableJson } from '$lib/utils/blueprint-validation';
	import AccessDenied from '$lib/components/ui/AccessDenied.svelte';
	import { Button } from '$lib/components/ui/button';
	import StickyHeader from '$lib/components/ui/StickyHeader.svelte';
	import UsersTabNav from '$lib/components/users/UsersTabNav.svelte';
	import { toast } from 'svelte-sonner';
	import { Save, Loader2 } from 'lucide-svelte';

	const isSuper = $derived(auth.isSuperAdmin);
	// Accounts config is persisted through the config write path.
	const canSave = $derived(canWrite('config'));

	let blueprint = $state<BlueprintSchema | null>(null);
	let configData = $state<Record<string, unknown>>({});
	let validationErrors = $state<Record<string, string>>({});
	let originalJson = $state('{}');
	let etag = $state('');
	let loading = $state(true);
	let saving = $state(false);
	let accessDenied = $state(false);

	const hasChanges = $derived(stableJson(configData) !== originalJson);
	// Reactive validity gate: keep Save disabled while any required field is empty
	// (admin2#34). Independent of the inline error display, which stays touch/submit-gated.
	let requiredOk = $derived(!blueprint || !hasRequiredErrors(blueprint.fields, configData));

	async function load() {
		loading = true;
		try {
			const [cfg, bp] = await Promise.all([
				getConfig('accounts'),
				getAccountsConfigBlueprint().catch(() => null),
			]);
			configData = cfg.data ?? {};
			originalJson = stableJson(configData);
			etag = cfg.etag;
			blueprint = bp;
		} catch (err: unknown) {
			const status = err && typeof err === 'object' && 'status' in err ? (err as { status: number }).status : 0;
			if (status === 403) {
				accessDenied = true;
			} else {
				toast.error(i18n.t('ADMIN_NEXT.ACCOUNTS_CONFIG.FAILED_TO_LOAD'));
			}
		} finally {
			loading = false;
		}
	}

	function handleChange(path: string, value: unknown) {
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
		const err = blueprint ? validateFieldAt(blueprint.fields, path, next) : null;
		if (err) {
			validationErrors = { ...validationErrors, [path]: err };
		} else if (validationErrors[path]) {
			const { [path]: _cleared, ...rest } = validationErrors;
			validationErrors = rest;
		}
	}

	async function handleSave() {
		// Block the save if any required field is empty (admin2#30).
		validationErrors = blueprint ? checkRequiredOrToast(blueprint.fields, configData) : {};
		if (Object.keys(validationErrors).length > 0) {
			scrollToFirstError();
			return;
		}

		saving = true;
		try {
			const result = await saveConfig('accounts', configData, etag);
			configData = result.data ?? configData;
			originalJson = stableJson(configData);
			etag = result.etag;
			toast.success(i18n.t('ADMIN_NEXT.ACCOUNTS_CONFIG.SAVED'));
		} catch (err: unknown) {
			const status = err && typeof err === 'object' && 'status' in err ? (err as { status: number }).status : 0;
			if (status === 409) {
				toast.error(i18n.t('ADMIN_NEXT.ACCOUNTS_CONFIG.MODIFIED_ELSEWHERE'));
			} else {
				toast.error(i18n.t('ADMIN_NEXT.ACCOUNTS_CONFIG.FAILED_TO_SAVE'));
			}
		} finally {
			saving = false;
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
	<title>{i18n.t('ADMIN_NEXT.ACCOUNTS_CONFIG.PAGE_TITLE')}</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

{#if !isSuper && !accessDenied}
	<AccessDenied />
{:else if accessDenied}
	<AccessDenied />
{:else}
	<div class="flex h-full flex-col">
		<StickyHeader noBorder>
			{#snippet children({ scrolled })}
				<div class="px-6 transition-[padding] duration-200 {scrolled ? 'py-2' : 'pt-6 pb-3'}">
					<div class="flex items-center justify-between {scrolled ? 'min-h-6' : 'min-h-8'}">
						<div>
							<h1 class="font-semibold tracking-tight text-foreground transition-[font-size] duration-200 {scrolled ? 'text-sm' : 'text-xl'}">
								{i18n.t('ADMIN_NEXT.ACCOUNTS_CONFIG.TITLE')}
							</h1>
							{#if !scrolled}
								<p class="mt-0.5 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.ACCOUNTS_CONFIG.SUBTITLE')}</p>
							{/if}
						</div>
						<Button size="sm" disabled={!hasChanges || saving || !requiredOk || !canSave} onclick={handleSave}>
							{#if saving}
								<Loader2 size={14} class="animate-spin" />
							{:else}
								<Save size={14} />
							{/if}
							{i18n.t('ADMIN_NEXT.SAVE')}
						</Button>
					</div>
				</div>
			{/snippet}
		</StickyHeader>

		<UsersTabNav />

		{#if loading}
			<div class="flex flex-1 items-center justify-center">
				<Loader2 size={24} class="animate-spin text-muted-foreground" />
			</div>
		{:else if blueprint}
			<div class="flex-1 overflow-y-auto">
				<div class="px-6 py-6">
					<BlueprintForm
						fields={blueprint.fields}
						data={configData}
						onchange={handleChange}
						errors={validationErrors}
					/>
				</div>
			</div>
		{:else}
			<div class="flex flex-1 items-center justify-center text-sm text-muted-foreground">
				{i18n.t('ADMIN_NEXT.ACCOUNTS_CONFIG.NO_FIELDS')}
			</div>
		{/if}
	</div>
{/if}
