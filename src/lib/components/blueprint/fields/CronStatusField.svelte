<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { getSchedulerStatus, getSchedulerJobs, runScheduler, runSchedulerJob } from '$lib/api/endpoints/tools';
	import type { SchedulerStatus, SchedulerJob, SchedulerRunMode, SchedulerRunResult } from '$lib/api/endpoints/tools';
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { Button } from '$lib/components/ui/button';
	import {
		Play, Loader2, CheckCircle2, XCircle, AlertTriangle,
		Activity, Webhook, Terminal, Clock, FastForward, X
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
	/** Which run is in flight: a mode for the whole scheduler, a job id, or null. */
	let running = $state<string | null>(null);
	let lastResult = $state<SchedulerRunResult | null>(null);

	const overdueCount = $derived(jobs.filter((j) => j.enabled && j.overdue).length);

	async function load() {
		loading = true;
		try {
			// Settle these independently: the jobs list is the useful half, and a host
			// that cannot report its cron status must not lose it (#16).
			const [statusResult, jobsResult] = await Promise.all([
				getSchedulerStatus().catch(() => null),
				getSchedulerJobs().catch(() => [] as SchedulerJob[]),
			]);
			status = statusResult;
			jobs = jobsResult;
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.FAILED_TO_LOAD_SCHEDULER_STATUS'));
		} finally {
			loading = false;
		}
	}

	async function handleRun(mode: SchedulerRunMode) {
		await execute(mode, () => runScheduler(mode));
	}

	async function handleRunJob(job: SchedulerJob) {
		await execute(job.id, () => runSchedulerJob(job.id));
	}

	/**
	 * A run can take a while -- a backup or a reindex is a real shell command -- so the
	 * result is kept on screen rather than only flashed in a toast. The whole list is
	 * reloaded afterwards so the last-run times and the overdue flags catch up.
	 */
	async function execute(token: string, call: () => Promise<SchedulerRunResult>) {
		running = token;
		lastResult = null;
		try {
			const result = await call();
			lastResult = result;
			if (result.jobs_failed > 0) {
				toast.error(result.message);
			} else {
				toast.success(result.message);
			}
			await load();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.FAILED_TO_RUN_SCHEDULER'));
		} finally {
			running = null;
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

	function cronToHuman(expr: string | null | undefined): string {
		// A job registered without a schedule of its own runs every minute, which is what the
		// scheduler falls back to. Reading the missing value as a string crashed the whole panel.
		if (!expr) return 'Every minute';
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
			<div class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
				<h3 class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.SCHEDULER_STATUS')}</h3>
				<div class="flex items-center gap-2">
					<!-- Runs the jobs that missed their last slot. This is what somebody without a
					     cron entry means by "run the scheduler now": a job counts as due only during
					     the exact minute its schedule names, so a plain due-run would do nothing. -->
					<Button size="sm" onclick={() => handleRun('overdue')} disabled={running !== null || status?.process_available === false}>
						{#if running === 'overdue'}
							<Loader2 size={14} class="animate-spin" />
							{i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.RUNNING')}
						{:else}
							<Play size={14} />
							{i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.RUN_PENDING')}
							{#if overdueCount > 0}
								<span class="ms-1 rounded-full bg-primary-foreground/20 px-1.5 text-xs font-semibold">{overdueCount}</span>
							{/if}
						{/if}
					</Button>
					<Button
						size="sm"
						variant="outline"
						onclick={() => handleRun('all')}
						disabled={running !== null || status?.process_available === false}
						title={i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.RUN_ALL_HELP')}
					>
						{#if running === 'all'}
							<Loader2 size={14} class="animate-spin" />
							{i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.RUNNING')}
						{:else}
							<FastForward size={14} />
							{i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.RUN_ALL')}
						{/if}
					</Button>
				</div>
			</div>

			<!-- What a manual run is for, said once, where the buttons are. -->
			<div class="flex items-start gap-2 border-b border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
				<Clock size={14} class="mt-0.5 shrink-0" />
				<span>{i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.MANUAL_RUN_HELP')}</span>
			</div>

			{#if lastResult}
				<div class="border-b border-border px-4 py-3">
					<div class="flex items-start justify-between gap-2">
						<p class="text-sm font-medium text-foreground">
							{lastResult.message}
							<span class="font-normal text-muted-foreground">({lastResult.duration}s)</span>
						</p>
						<button
							type="button"
							class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
							onclick={() => (lastResult = null)}
							aria-label={i18n.t('ADMIN_NEXT.CLOSE')}
						>
							<X size={14} />
						</button>
					</div>
					{#if lastResult.results.length > 0}
						<ul class="mt-2 space-y-1.5">
							{#each lastResult.results as result (result.id)}
								<li class="text-xs">
									<span class="inline-flex items-center gap-1.5 font-medium {result.successful ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}">
										{#if result.successful}<CheckCircle2 size={12} />{:else}<XCircle size={12} />{/if}
										{result.id}
									</span>
									{#if result.output}
										<pre class="mt-1 max-h-32 overflow-auto rounded-md bg-muted px-3 py-2 font-mono text-[0.6875rem] text-muted-foreground whitespace-pre-wrap">{result.output}</pre>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/if}

			{#if status?.process_available === false}
				<div class="flex items-start gap-2 border-b border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
					<AlertTriangle size={14} class="mt-0.5 shrink-0" />
					<span>{i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.PROCESS_UNAVAILABLE')}</span>
				</div>
			{/if}

			{#if jobs.length === 0}
				<div class="p-6 text-center text-sm text-muted-foreground">{i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.NO_SCHEDULED_JOBS_REGISTERED')}</div>
			{:else}
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b border-border text-start text-xs font-medium text-muted-foreground">
							<th class="px-4 py-3">{i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.JOB_ID')}</th>
							<th class="px-4 py-3">Run</th>
							<th class="px-4 py-3">{i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.LAST_RUN')}</th>
							<th class="px-4 py-3">{i18n.t('ADMIN_NEXT.PAGES.HEADER_STATUS')}</th>
							<th class="px-4 py-3">State</th>
							<th class="px-4 py-3 text-end"><span class="sr-only">{i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.RUN_NOW')}</span></th>
						</tr>
					</thead>
					<tbody>
						{#each jobs as job (job.id)}
							<tr class="border-b border-border last:border-0 hover:bg-muted/30">
								<td class="px-4 py-3">
									<span class="font-medium text-primary">{job.id}</span>
								</td>
								<td class="px-4 py-3 text-muted-foreground">{cronToHuman(job.expression)}</td>
								<td class="px-4 py-3 text-muted-foreground">
									{#if job.last_run}
										{new Date(job.last_run).toLocaleString()}
										{#if job.last_run_trigger === 'manual'}
											<span class="ms-1 text-xs">({i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.BY_HAND')})</span>
										{/if}
									{:else}
										{i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.NEVER')}
									{/if}
								</td>
								<!-- Two different things, so two badges: how the last run went, and whether
								     the job is waiting on a slot it has already missed. -->
								<td class="px-4 py-3">
									<div class="flex flex-wrap items-center gap-1.5">
										{#if job.error}
											<span class="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive">
												<XCircle size={12} /> Error
											</span>
										{:else}
											<span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-500">
												<CheckCircle2 size={12} /> Ready
											</span>
										{/if}
										{#if job.enabled && job.overdue}
											<span class="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
												<Clock size={12} /> {i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.PENDING')}
											</span>
										{/if}
									</div>
								</td>
								<td class="px-4 py-3">
									{#if job.enabled}
										<span class="inline-block rounded-l-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">{i18n.t('ADMIN_NEXT.ENABLED')}</span><span class="inline-block rounded-r-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.DISABLED')}</span>
									{:else}
										<span class="inline-block rounded-l-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.ENABLED')}</span><span class="inline-block rounded-r-md bg-destructive px-2.5 py-1 text-xs font-semibold text-destructive-foreground">{i18n.t('ADMIN_NEXT.DISABLED')}</span>
									{/if}
								</td>
								<td class="px-4 py-3 text-end">
									<Button
										size="icon"
										variant="ghost"
										class="h-7 w-7"
										onclick={() => handleRunJob(job)}
										disabled={running !== null || !job.enabled || status?.process_available === false}
										title={i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.RUN_NOW')}
										aria-label={i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.RUN_NOW')}
									>
										{#if running === job.id}
											<Loader2 size={14} class="animate-spin" />
										{:else}
											<Play size={14} />
										{/if}
									</Button>
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
							<p class="text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">{i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.LAST_RUN')}</p>
							<p class="mt-1 text-lg font-bold text-foreground">{relativeAge(status.health.last_run_age)}</p>
						</div>
						<div class="rounded-md bg-muted/50 px-4 py-3">
							<p class="text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">{i18n.t('ADMIN_NEXT.FIELDS.CRON_STATUS.SCHEDULED_JOBS')}</p>
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
