<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { getSchedulerStatus } from '$lib/api/endpoints/tools';
	import type { SchedulerStatus } from '$lib/api/endpoints/tools';
	import { getConfigBlueprint } from '$lib/api/endpoints/blueprints';
	import { getConfig, saveConfig } from '$lib/api/endpoints/config';
	import type { BlueprintSchema } from '$lib/api/endpoints/blueprints';
	import BlueprintForm from '$lib/components/blueprint/BlueprintForm.svelte';
	import CopyButton from '$lib/components/ui/CopyButton.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Save, Loader2, AlertTriangle, Info, Shield } from 'lucide-svelte';

	let status = $state<SchedulerStatus | null>(null);
	let blueprint = $state<BlueprintSchema | null>(null);
	let configData = $state<Record<string, unknown>>({});
	let originalJson = $state('{}');
	let etag = $state('');
	let loading = $state(true);
	let saving = $state(false);

	let hasChanges = $derived(JSON.stringify(configData) !== originalJson);

	async function load() {
		loading = true;
		try {
			const [statusResult, bp, cfg] = await Promise.all([
				getSchedulerStatus(),
				getConfigBlueprint('scheduler').catch(() => null),
				getConfig('scheduler'),
			]);
			status = statusResult;
			blueprint = bp;
			configData = cfg.data;
			originalJson = JSON.stringify(cfg.data);
			etag = cfg.etag;
		} catch {
			toast.error('Failed to load scheduler configuration.');
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
	}

	async function handleSave() {
		saving = true;
		try {
			const result = await saveConfig('scheduler', configData, etag);
			configData = result.data;
			originalJson = JSON.stringify(result.data);
			etag = result.etag;
			toast.success('Scheduler configuration saved');
		} catch {
			toast.error('Failed to save');
		} finally {
			saving = false;
		}
	}

	onMount(load);
</script>

<div class="space-y-4">
	{#if loading}
		<div class="p-8 text-center text-sm text-muted-foreground">Loading scheduler...</div>
	{:else if status}

		<!-- Cron Status Notice -->
		{#if status.crontab_status !== 'installed'}
			<div class="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950/30 dark:text-red-300">
				<AlertTriangle size={16} />
				Not Enabled for user: <strong>{status.whoami}</strong>
			</div>
		{/if}

		<!-- Info Banner -->
		<div class="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700 dark:border-blue-800/50 dark:bg-blue-950/30 dark:text-blue-300">
			<Info size={16} class="mt-0.5 shrink-0" />
			<span>
				The scheduler can use either system crontab or webhook triggers to execute commands.
				Webhooks are recommended for cloud environments. Only advanced users should configure custom jobs.
				Misconfiguration or abuse can lead to security vulnerabilities.
			</span>
		</div>

		<!-- Cron Command -->
		{#if status.cron_command}
			<div class="rounded-lg border border-border bg-card p-4">
				<div class="flex items-start gap-2">
					<code class="block flex-1 overflow-x-auto rounded-md bg-muted px-3 py-2.5 font-mono text-xs text-foreground">{status.cron_command}</code>
					<CopyButton text={status.cron_command} />
				</div>
				<p class="mt-3 text-sm text-muted-foreground">
					To enable the Scheduler's functionality, you must add the <strong class="text-foreground">Grav Scheduler</strong> to
					your system's crontab file for the <strong class="text-foreground">{status.whoami}</strong> user.
					Run the command above from the terminal to add it automatically. Once saved, refresh this page to see the status.
				</p>
				{#if !status.webhook_installed}
					<p class="mt-2 text-sm text-muted-foreground">
						Alternatively, install the <strong class="text-foreground">scheduler-webhook</strong> plugin to use webhook-based cron firing,
						which is recommended for cloud environments where system crontab access is not available.
					</p>
				{/if}
			</div>
		{/if}

		<!-- Security Warning -->
		<div class="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
			<Shield size={16} class="mt-0.5 shrink-0" />
			<span>
				Only advanced users should configure custom scheduler jobs. Incorrect configuration
				can cause performance issues or security vulnerabilities.
			</span>
		</div>

		<!-- Save button (always visible, disabled when no changes) -->
		<div class="flex justify-end">
			<Button size="sm" onclick={handleSave} disabled={saving || !hasChanges} class={hasChanges ? '' : 'opacity-50'}>
				{#if saving}
					<Loader2 size={14} class="animate-spin" />
					Saving...
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
			/>
		{/if}

	{/if}
</div>
