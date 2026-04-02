<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { getSchedulerStatus, getSchedulerJobs, runScheduler } from '$lib/api/endpoints/tools';
	import type { SchedulerStatus, SchedulerJob } from '$lib/api/endpoints/tools';
	import { Button } from '$lib/components/ui/button';
	import CopyButton from '$lib/components/ui/CopyButton.svelte';
	import { Play, Loader2, ChevronDown, CheckCircle2, XCircle, AlertTriangle, Clock } from 'lucide-svelte';

	let status = $state<SchedulerStatus | null>(null);
	let jobs = $state<SchedulerJob[]>([]);
	let loading = $state(true);
	let running = $state(false);
	let showInstructions = $state(false);

	async function load() {
		loading = true;
		try {
			[status, jobs] = await Promise.all([getSchedulerStatus(), getSchedulerJobs()]);
		} catch {
			toast.error('Failed to load scheduler info');
		} finally {
			loading = false;
		}
	}

	async function handleRun() {
		running = true;
		try {
			await runScheduler();
			toast.success('Scheduler run completed');
			await load();
		} catch {
			toast.error('Failed to run scheduler');
		} finally {
			running = false;
		}
	}

	function relativeTime(dateStr: string | null): string {
		if (!dateStr) return 'never';
		const diff = Date.now() - new Date(dateStr).getTime();
		const mins = Math.floor(diff / 60000);
		if (mins < 1) return 'just now';
		if (mins < 60) return `${mins}m ago`;
		const hrs = Math.floor(mins / 60);
		if (hrs < 24) return `${hrs}h ago`;
		const days = Math.floor(hrs / 24);
		return `${days}d ago`;
	}

	onMount(load);
</script>

<div class="space-y-4">
	{#if loading}
		<div class="p-8 text-center text-sm text-muted-foreground">Loading scheduler...</div>
	{:else}
		<!-- Status Banner -->
		{#if status}
			<div class="rounded-lg border border-border bg-card p-4">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-3">
						{#if status.crontab_status === 'installed'}
							<div class="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10">
								<CheckCircle2 size={18} class="text-emerald-500" />
							</div>
							<div>
								<p class="text-sm font-semibold text-foreground">Cron Installed</p>
								<p class="text-xs text-muted-foreground">Running as: {status.whoami}</p>
							</div>
						{:else if status.crontab_status === 'error'}
							<div class="flex h-8 w-8 items-center justify-center rounded-full bg-destructive/10">
								<XCircle size={18} class="text-destructive" />
							</div>
							<div>
								<p class="text-sm font-semibold text-foreground">Cron Error</p>
								<p class="text-xs text-muted-foreground">There was a problem checking cron status</p>
							</div>
						{:else}
							<div class="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/10">
								<AlertTriangle size={18} class="text-amber-500" />
							</div>
							<div>
								<p class="text-sm font-semibold text-foreground">Cron Not Installed</p>
								<p class="text-xs text-muted-foreground">Set up cron to enable automatic scheduling</p>
							</div>
						{/if}
					</div>
					<button
						class="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
						onclick={() => showInstructions = !showInstructions}
					>
						Setup Instructions
						<ChevronDown size={14} class="transition-transform {showInstructions ? 'rotate-180' : ''}" />
					</button>
				</div>

				{#if showInstructions && status.cron_command}
					<div class="mt-4 space-y-3 border-t border-border pt-4">
						<div>
							<p class="mb-1.5 text-xs font-medium text-muted-foreground">Add this line to your crontab:</p>
							<div class="flex items-start gap-2">
								<code class="block flex-1 rounded-md bg-muted px-3 py-2 font-mono text-xs text-foreground">{status.cron_command}</code>
								<CopyButton text={status.cron_command} />
							</div>
						</div>
						<p class="text-xs text-muted-foreground">
							Run <code class="rounded bg-muted px-1.5 py-0.5 text-[11px]">crontab -e</code> to edit your crontab, paste the line above, save and exit.
						</p>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Jobs Table -->
		<div class="rounded-lg border border-border bg-card">
			<div class="flex items-center justify-between border-b border-border px-4 py-3">
				<h3 class="text-sm font-semibold text-foreground">Scheduled Jobs</h3>
				<Button size="sm" variant="outline" onclick={handleRun} disabled={running}>
					{#if running}
						<Loader2 size={14} class="animate-spin" />
						Running...
					{:else}
						<Play size={14} />
						Run All
					{/if}
				</Button>
			</div>

			{#if jobs.length === 0}
				<div class="p-8 text-center text-sm text-muted-foreground">No scheduled jobs registered.</div>
			{:else}
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b border-border text-left text-xs font-medium text-muted-foreground">
							<th class="px-4 py-3">Job</th>
							<th class="px-4 py-3">Schedule</th>
							<th class="px-4 py-3">Status</th>
							<th class="px-4 py-3">Last Run</th>
						</tr>
					</thead>
					<tbody>
						{#each jobs as job (job.id)}
							<tr class="border-b border-border last:border-0 hover:bg-muted/30">
								<td class="px-4 py-3">
									<span class="font-medium text-foreground">{job.id}</span>
									<p class="mt-0.5 truncate text-xs text-muted-foreground" title={job.command}>{job.command}</p>
								</td>
								<td class="px-4 py-3">
									<code class="rounded bg-muted px-1.5 py-0.5 text-xs">{job.expression}</code>
								</td>
								<td class="px-4 py-3">
									{#if job.error}
										<span class="inline-flex items-center gap-1 text-xs font-medium text-destructive">
											<span class="h-1.5 w-1.5 rounded-full bg-destructive"></span>
											error
										</span>
									{:else if job.status === 'pending'}
										<span class="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
											<span class="h-1.5 w-1.5 rounded-full bg-muted-foreground/50"></span>
											pending
										</span>
									{:else}
										<span class="inline-flex items-center gap-1 text-xs font-medium text-emerald-500">
											<span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
											ok
										</span>
									{/if}
								</td>
								<td class="px-4 py-3">
									<span class="flex items-center gap-1 text-xs text-muted-foreground">
										<Clock size={12} />
										{relativeTime(job.last_run)}
									</span>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</div>
	{/if}
</div>
