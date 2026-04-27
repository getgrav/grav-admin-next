<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { getSchedulerStatus, getSchedulerJobs, runScheduler } from '$lib/api/endpoints/tools';
	import type { SchedulerStatus, SchedulerJob } from '$lib/api/endpoints/tools';
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { Button } from '$lib/components/ui/button';
	import {
		Play, Loader2, CheckCircle2, XCircle, AlertTriangle,
		Activity, Webhook, Terminal
	} from 'lucide-svelte';

	interface Props {
		field: BlueprintField;
		value: unknown;
		onchange: (value: unknown) => void;
	}

	let { field, value, onchange }: Props = $props();

	let status = $state<SchedulerStatus | null>(null);
	let jobs = $state<SchedulerJob[]>([]);
	let loading = $state(true);
	let running = $state(false);

	async function load() {
		loading = true;
		try {
			[status, jobs] = await Promise.all([getSchedulerStatus(), getSchedulerJobs()]);
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.FAILED_TO_LOAD_SCHEDULER_STATUS'));
		} finally {
			loading = false;
		}
	}

	async function handleRun() {
		running = true;
		try {
			await runScheduler();
			toast.success(i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.SCHEDULER_RUN_COMPLETED'));
			await load();
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.FAILED_TO_RUN_SCHEDULER'));
		} finally {
			running = false;
		}
	}

	function relativeAge(seconds: number | null): string {
		if (seconds === null) return 'Never';
		if (seconds < 60) return `${seconds} second(s) ago`;
		const mins = Math.floor(seconds / 60);
		if (mins < 60) return `${mins} minute(s) ago`;
		const hrs = Math.floor(mins / 60);
		if (hrs < 24) return `${hrs} hour(s) ago`;
		const days = Math.floor(hrs / 24);
		return `${days} day(s) ago`;
	}

	function cronToHuman(expr: string): string {
		const parts = expr.split(/\s+/);
		if (parts.length < 5) return expr;
		const [min, hour, dom, mon, dow] = parts;
		if (min === '*' && hour === '*') return 'Every minute';
		if (min === '*' && hour !== '*' && !hour.includes('/')) return `Every minute at ${hour.padStart(2, '0')}:xx`;
		if (hour === '*' && min !== '*' && !min.includes('/')) return `Every hour at :${min.padStart(2, '0')}`;
		if (dom === '*' && mon === '*' && dow === '*' && hour !== '*' && min !== '*')
			return `Every day at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
		if (hour.startsWith('*/')) return `Every ${hour.slice(2)} hours`;
		if (min.startsWith('*/')) return `Every ${min.slice(2)} minutes`;
		return expr;
	}

	onMount(load);
</script>

<div class="space-y-4">
	{#if loading}
		<div class="p-6 text-center text-sm text-muted-foreground">{i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.LOADING_SCHEDULER_STATUS')}</div>
	{:else}

		<!-- Job Status Table -->
		<div class="rounded-lg border border-border bg-card">
			<div class="flex items-center justify-between border-b border-border px-4 py-3">
				<h3 class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.SCHEDULER_STATUS')}</h3>
				<Button size="sm" variant="outline" onclick={handleRun} disabled={running}>
					{#if running}
						<Loader2 size={14} class="animate-spin" />
						{i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.RUNNING')}
					{:else}
						<Play size={14} />
						{i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.RUN_ALL')}
					{/if}
				</Button>
			</div>

			{#if jobs.length === 0}
				<div class="p-6 text-center text-sm text-muted-foreground">{i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.NO_SCHEDULED_JOBS_REGISTERED')}</div>
			{:else}
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b border-border text-left text-xs font-medium text-muted-foreground">
							<th class="px-4 py-3">{i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.JOB_ID')}</th>
							<th class="px-4 py-3">Run</th>
							<th class="px-4 py-3">{i18n.t('ADMIN_NEXT.PAGES.HEADER_STATUS')}</th>
							<th class="px-4 py-3 text-right">State</th>
						</tr>
					</thead>
					<tbody>
						{#each jobs as job (job.id)}
							<tr class="border-b border-border last:border-0 hover:bg-muted/30">
								<td class="px-4 py-3">
									<span class="font-medium text-primary">{job.id}</span>
								</td>
								<td class="px-4 py-3 text-muted-foreground">{cronToHuman(job.expression)}</td>
								<td class="px-4 py-3">
									{#if job.error}
										<span class="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive">
											<XCircle size={12} /> Error
										</span>
									{:else}
										<span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-500">
											<CheckCircle2 size={12} /> Ready
										</span>
									{/if}
								</td>
								<td class="px-4 py-3 text-right">
									{#if job.enabled}
										<span class="inline-block rounded-l-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">{i18n.t('ADMIN_NEXT.ENABLED')}</span><span class="inline-block rounded-r-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.DISABLED')}</span>
									{:else}
										<span class="inline-block rounded-l-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.ENABLED')}</span><span class="inline-block rounded-r-md bg-destructive px-2.5 py-1 text-xs font-semibold text-destructive-foreground">{i18n.t('ADMIN_NEXT.DISABLED')}</span>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</div>

		<!-- Health Status -->
		{#if status?.health}
			<div class="rounded-lg border border-border bg-card">
				<div class="flex items-center gap-2 border-b border-border px-4 py-3">
					<Activity size={15} class="text-muted-foreground" />
					<h3 class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.HEALTH_STATUS')}</h3>
				</div>
				<div class="space-y-3 p-4">
					<div class="flex items-center justify-between rounded-md bg-muted/50 px-4 py-2.5">
						<span class="text-sm font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.STATUS')}</span>
						{#if status.health.status === 'healthy'}
							<span class="rounded-md bg-emerald-600/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">HEALTHY</span>
						{:else if status.health.status === 'warning'}
							<span class="rounded-md bg-amber-600/10 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">WARNING</span>
						{:else}
							<span class="rounded-md bg-red-600/10 px-2.5 py-1 text-xs font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300">ERROR</span>
						{/if}
					</div>
					<div class="grid grid-cols-2 gap-3">
						<div class="rounded-md bg-muted/50 px-4 py-3">
							<p class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.LAST_RUN')}</p>
							<p class="mt-1 text-lg font-bold text-foreground">{relativeAge(status.health.last_run_age)}</p>
						</div>
						<div class="rounded-md bg-muted/50 px-4 py-3">
							<p class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.SCHEDULED_JOBS')}</p>
							<p class="mt-1 text-lg font-bold text-foreground">{status.health.scheduled_jobs}</p>
						</div>
					</div>
					<div class="rounded-md bg-muted/50 px-4 py-2.5 text-sm text-muted-foreground">
						{i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.QUEUE_SIZE')} <span class="font-semibold text-foreground">{status.health.queue_size}</span>
					</div>
				</div>
			</div>
		{/if}

		<!-- Active Triggers -->
		{#if status}
			<div class="rounded-lg border border-border bg-card">
				<div class="flex items-center gap-2 border-b border-border px-4 py-3">
					<Webhook size={15} class="text-muted-foreground" />
					<h3 class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.ACTIVE_TRIGGERS')}</h3>
				</div>
				<div class="divide-y divide-border">
					<div class="flex items-center justify-between px-4 py-3">
						<div class="flex items-center gap-2.5">
							<Terminal size={16} class="text-muted-foreground" />
							<span class="text-sm font-medium text-foreground">{i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.CRON')}</span>
						</div>
						{#if status.triggers.includes('cron')}
							<span class="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-500">CONFIGURED</span>
						{:else}
							<span class="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">{i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.NOT_CONFIGURED')}</span>
						{/if}
					</div>
					<div class="flex items-center justify-between px-4 py-3">
						<div class="flex items-center gap-2.5">
							<Webhook size={16} class="text-muted-foreground" />
							<span class="text-sm font-medium text-foreground">{i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.WEBHOOK')}</span>
						</div>
						{#if status.triggers.includes('webhook')}
							<span class="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-500">ENABLED</span>
						{:else if !status.webhook_installed}
							<span class="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">{i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.NOT_INSTALLED')}</span>
						{:else}
							<span class="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-500">{i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.NOT_ENABLED')}</span>
						{/if}
					</div>
					{#if status.triggers.length === 0}
						<div class="px-4 py-3">
							<div class="flex items-center gap-2 text-xs text-amber-500">
								<AlertTriangle size={14} />
								{i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.NO_TRIGGERS_ACTIVE_ENABLE_WEBHOOKS_OR')}
							</div>
						</div>
					{/if}
				</div>
			</div>
		{/if}

	{/if}
</div>
