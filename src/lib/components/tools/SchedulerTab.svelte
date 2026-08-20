<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { getSchedulerStatus } from '$lib/api/endpoints/tools';
	import type { SchedulerStatus } from '$lib/api/endpoints/tools';
	import { getConfigBlueprint } from '$lib/api/endpoints/blueprints';
	import { getConfig, saveConfig } from '$lib/api/endpoints/config';
	import type { BlueprintSchema } from '$lib/api/endpoints/blueprints';
	import BlueprintForm from '$lib/components/blueprint/BlueprintForm.svelte';
	import { checkRequiredOrToast, scrollToFirstError, validateFieldAt, stableJson } from '$lib/utils/blueprint-validation';
	import { canWrite } from '$lib/utils/permissions';
	import CopyButton from '$lib/components/ui/CopyButton.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Save, Loader2, AlertTriangle, Info, Shield } from 'lucide-svelte';

	let status = $state<SchedulerStatus | null>(null);
	let blueprint = $state<BlueprintSchema | null>(null);
	let configData = $state<Record<string, unknown>>({});
	let validationErrors = $state<Record<string, string>>({});
	let originalJson = $state('{}');
	let etag = $state('');
	let loading = $state(true);
	let saving = $state(false);

	let hasChanges = $derived(stableJson(configData) !== originalJson);
	const canSave = $derived(canWrite('system'));

	async function load() {
		loading = true;
		try {
			// Status is cosmetic; a host that cannot report it must still get an editable
			// jobs list, so it must not take the rest of the page with it (#16).
			const [statusResult, bp, cfg] = await Promise.all([
				getSchedulerStatus().catch(() => null),
				getConfigBlueprint('scheduler').catch(() => null),
				getConfig('scheduler'),
			]);
			status = statusResult;
			blueprint = bp;
			configData = cfg.data;
			originalJson = stableJson(cfg.data);
			etag = cfg.etag;
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.TOOLS.SCHEDULER.FAILED_TO_LOAD_SCHEDULER_CONFIGURATION'));
		} finally {
			loading = false;
		}
	}

	function handleBlueprintChange(path: string, value: unknown) {
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

	async function handleSave() {
		// Block the save if any required field is empty (admin2#30).
		validationErrors = blueprint ? checkRequiredOrToast(blueprint.fields, configData) : {};
		if (Object.keys(validationErrors).length > 0) {
			scrollToFirstError();
			return;
		}

		saving = true;
		try {
			const result = await saveConfig('scheduler', configData, etag);
			configData = result.data;
			originalJson = stableJson(result.data);
			etag = result.etag;
			toast.success(i18n.t('ADMIN_NEXT.TOOLS.SCHEDULER.SCHEDULER_CONFIGURATION_SAVED'));
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.TOOLS.SCHEDULER.FAILED_TO_SAVE'));
		} finally {
			saving = false;
		}
	}

	onMount(load);
</script>

<div class="space-y-4">
	{#if loading}
		<div class="p-8 text-center text-sm text-muted-foreground">{i18n.t('ADMIN_NEXT.TOOLS.SCHEDULER.LOADING_SCHEDULER')}</div>
	{:else}

		{#if !status}
			<div class="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
				<AlertTriangle size={16} class="mt-0.5 shrink-0" />
				<span>{i18n.t('ADMIN_NEXT.TOOLS.SCHEDULER.STATUS_UNAVAILABLE')}</span>
			</div>
		{/if}

		{#if status && !status.process_available}
			<div class="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
				<AlertTriangle size={16} class="mt-0.5 shrink-0" />
				<span>{i18n.t('ADMIN_NEXT.TOOLS.SCHEDULER.PROCESS_UNAVAILABLE')}</span>
			</div>
		{/if}

		<!-- Cron Status Notice. Only shown when we could actually determine it. -->
		{#if status && status.crontab_status === 'not_installed'}
			<div class="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950/30 dark:text-red-300">
				<AlertTriangle size={16} />
				{i18n.t('ADMIN_NEXT.TOOLS.SCHEDULER.NOT_ENABLED_FOR_USER')} <strong>{status.whoami}</strong>
			</div>
		{:else if status && status.crontab_status === 'unknown'}
			<div class="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
				<Info size={16} class="mt-0.5 shrink-0" />
				<span>{i18n.t('ADMIN_NEXT.TOOLS.SCHEDULER.CRON_UNDETERMINED')}</span>
			</div>
		{/if}

		{#if status?.last_run}
			<div class="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
				<Info size={16} class="mt-0.5 shrink-0" />
				<span>{i18n.t('ADMIN_NEXT.TOOLS.SCHEDULER.LAST_TRIGGERED')} {new Date(status.last_run).toLocaleString()}</span>
			</div>
		{/if}

		<!-- Cron runs under a different environment than the site: overrides never load (grav#4248) -->
		{#if status?.environment_has_overrides && status.last_run_environment && status.last_run_environment !== status.environment}
			<div class="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
				<AlertTriangle size={16} class="mt-0.5 shrink-0" />
				<div class="min-w-0 flex-1 space-y-2">
					<p>{@html i18n.tHtml('ADMIN_NEXT.TOOLS.SCHEDULER.ENVIRONMENT_MISMATCH', { current: status.environment, last: status.last_run_environment })}</p>
					<div class="flex items-start gap-2">
						<code class="block flex-1 overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs text-foreground">{status.scheduler_command}</code>
						<CopyButton text={status.scheduler_command} />
					</div>
				</div>
			</div>
		{/if}

		<!-- Info Banner -->
		<div class="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700 dark:border-blue-800/50 dark:bg-blue-950/30 dark:text-blue-300">
			<Info size={16} class="mt-0.5 shrink-0" />
			<span>{i18n.t('ADMIN_NEXT.TOOLS.SCHEDULER.INFO_BANNER')}</span>
		</div>

		<!-- Cron Command -->
		{#if status?.cron_command && status.crontab_status !== 'installed'}
			<div class="rounded-lg border border-border bg-card p-4">
				<div class="flex items-start gap-2">
					<code class="block flex-1 overflow-x-auto rounded-md bg-muted px-3 py-2.5 font-mono text-xs text-foreground">{status.cron_command}</code>
					<CopyButton text={status.cron_command} />
				</div>
				<p class="mt-3 text-sm text-muted-foreground">
					{@html i18n.tHtml('ADMIN_NEXT.TOOLS.SCHEDULER.CRONTAB_INSTRUCTIONS', { user: status.whoami })}
				</p>
				{#if !status.webhook_installed}
					<p class="mt-2 text-sm text-muted-foreground">
						{@html i18n.tHtml('ADMIN_NEXT.TOOLS.SCHEDULER.WEBHOOK_ALTERNATIVE')}
					</p>
				{/if}
			</div>
		{/if}

		<!-- Security Warning -->
		<div class="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
			<Shield size={16} class="mt-0.5 shrink-0" />
			<span>{i18n.t('ADMIN_NEXT.TOOLS.SCHEDULER.SECURITY_WARNING')}</span>
		</div>

		<!-- Save button (always visible, disabled when no changes) -->
		<div class="flex justify-end">
			<Button size="sm" onclick={handleSave} disabled={saving || !hasChanges || !canSave} class={hasChanges ? '' : 'opacity-50'}>
				{#if saving}
					<Loader2 size={14} class="animate-spin" />
					{i18n.t('ADMIN_NEXT.SAVING')}
				{:else}
					<Save size={14} />
					Save
				{/if}
			</Button>
		</div>

		<!-- Blueprint Form (tabs: Scheduler Status, Custom Scheduler Jobs, Advanced Features) -->
		{#if blueprint}
			<BlueprintForm
				fields={blueprint.fields}
				data={configData}
				onchange={handleBlueprintChange}
				errors={validationErrors}
			/>
		{/if}

	{/if}
</div>
