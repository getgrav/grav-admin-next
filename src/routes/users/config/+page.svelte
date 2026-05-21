<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import { getConfig, saveConfig } from '$lib/api/endpoints/config';
	import { getAccountsConfigBlueprint, type BlueprintSchema } from '$lib/api/endpoints/blueprints';
	import BlueprintForm from '$lib/components/blueprint/BlueprintForm.svelte';
	import AccessDenied from '$lib/components/ui/AccessDenied.svelte';
	import { Button } from '$lib/components/ui/button';
	import StickyHeader from '$lib/components/ui/StickyHeader.svelte';
	import UsersTabNav from '$lib/components/users/UsersTabNav.svelte';
	import { toast } from 'svelte-sonner';
	import { Save, Loader2, Settings } from 'lucide-svelte';

	const isSuper = $derived(auth.isSuperAdmin);

	let blueprint = $state<BlueprintSchema | null>(null);
	let configData = $state<Record<string, unknown>>({});
	let originalJson = $state('{}');
	let etag = $state('');
	let loading = $state(true);
	let saving = $state(false);
	let accessDenied = $state(false);

	const hasChanges = $derived(JSON.stringify(configData) !== originalJson);

	async function load() {
		loading = true;
		try {
			const [cfg, bp] = await Promise.all([
				getConfig('accounts'),
				getAccountsConfigBlueprint().catch(() => null),
			]);
			configData = cfg.data ?? {};
			originalJson = JSON.stringify(configData);
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
	}

	async function handleSave() {
		saving = true;
		try {
			const result = await saveConfig('accounts', configData, etag);
			configData = result.data ?? configData;
			originalJson = JSON.stringify(configData);
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
						<div class="flex items-center gap-2">
							<Settings size={scrolled ? 16 : 20} class="text-muted-foreground" />
							<h1 class="font-semibold tracking-tight text-foreground transition-[font-size] duration-200 {scrolled ? 'text-sm' : 'text-xl'}">
								{i18n.t('ADMIN_NEXT.ACCOUNTS_CONFIG.TITLE')}
							</h1>
						</div>
						<Button size="sm" disabled={!hasChanges || saving} onclick={handleSave}>
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
