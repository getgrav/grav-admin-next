<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { onMount } from 'svelte';
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { getSchedulerStatus } from '$lib/api/endpoints/tools';
	import { Button } from '$lib/components/ui/button';
	import { CheckCircle2, XCircle, Download, AlertTriangle } from 'lucide-svelte';
	import { api } from '$lib/api/client';

	interface Props {
		field: BlueprintField;
		value: unknown;
		onchange: (value: unknown) => void;
	}

	let { field, value, onchange }: Props = $props();

	let installed = $state<boolean | null>(null);
	let enabled = $state(false);
	let loading = $state(true);

	async function load() {
		try {
			const status = await getSchedulerStatus();
			installed = status.webhook_installed;
			enabled = status.webhook_enabled;
		} catch {
			installed = false;
		} finally {
			loading = false;
		}
	}

	async function handleInstall() {
		try {
			await api.post('/gpm/install', { package: 'scheduler-webhook', type: 'plugin' });
			installed = true;
			window.location.reload();
		} catch {}
	}

	onMount(load);
</script>

{#if loading}
	<div class="text-sm text-muted-foreground">{i18n.t('ADMIN_NEXT.FIELDS.WEBHOOK_STATUS.CHECKING_WEBHOOK_PLUGIN_STATUS')}</div>
{:else if installed && enabled}
	<div class="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-300">
		<CheckCircle2 size={16} />
		<span><strong>scheduler-webhook</strong> {i18n.t('ADMIN_NEXT.FIELDS.WEBHOOK_STATUS.PLUGIN_IS_INSTALLED_AND_ENABLED')}</span>
	</div>
{:else if installed && !enabled}
	<div class="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
		<AlertTriangle size={16} />
		<span><strong>scheduler-webhook</strong> {i18n.t('ADMIN_NEXT.FIELDS.WEBHOOK_STATUS.PLUGIN_IS_INSTALLED_ENABLE_WEBHOOK')}</span>
	</div>
{:else}
	<div class="rounded-lg border border-border bg-card p-4">
		<h4 class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.FIELDS.WEBHOOK_STATUS.WEBHOOK_PLUGIN_REQUIRED')}</h4>
		<p class="mt-1 text-sm text-muted-foreground">
			The <span class="inline-flex items-center rounded-md bg-red-600/10 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">scheduler-webhook</span> {i18n.t('ADMIN_NEXT.FIELDS.WEBHOOK_STATUS.PLUGIN_IS_REQUIRED_FOR_WEBHOOK')}
		</p>
		<div class="mt-3 flex items-center gap-3">
			<Button size="sm" onclick={handleInstall}>
				<Download size={14} />
				{i18n.t('ADMIN_NEXT.FIELDS.WEBHOOK_STATUS.INSTALL_PLUGIN_NOW')}
			</Button>
			<span class="text-xs text-muted-foreground">
				{i18n.t('ADMIN_NEXT.FIELDS.WEBHOOK_STATUS.OR_RUN')} <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{i18n.t('ADMIN_NEXT.FIELDS.WEBHOOK_STATUS.BIN_GPM_INSTALL_SCHEDULER_WEBHOOK')}</code>
			</span>
		</div>
	</div>
{/if}
