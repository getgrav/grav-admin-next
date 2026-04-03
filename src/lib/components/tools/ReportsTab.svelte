<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { getReports } from '$lib/api/endpoints/tools';
	import type { ReportItem } from '$lib/api/endpoints/tools';
	import ReportComponentWrapper from './ReportComponentWrapper.svelte';
	import { ShieldAlert, CheckCircle2, AlertTriangle, XCircle, Loader2 } from 'lucide-svelte';

	let reports = $state<ReportItem[]>([]);
	let loading = $state(true);

	async function load() {
		loading = true;
		try {
			reports = await getReports();
		} catch {
			toast.error('Failed to load reports');
		} finally {
			loading = false;
		}
	}

	const statusConfig = {
		success: {
			bg: 'bg-emerald-500/10',
			text: 'text-emerald-700 dark:text-emerald-400',
			icon: CheckCircle2,
		},
		warning: {
			bg: 'bg-red-500/10',
			text: 'text-red-700 dark:text-red-400',
			icon: AlertTriangle,
		},
		error: {
			bg: 'bg-red-500/10',
			text: 'text-red-700 dark:text-red-400',
			icon: XCircle,
		},
	} as const;

	onMount(load);
</script>

<div class="space-y-6">
	{#if loading}
		<div class="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
			<Loader2 size={16} class="animate-spin" />
			Loading reports...
		</div>
	{:else if reports.length === 0}
		<div class="p-8 text-center text-sm text-muted-foreground">No reports available.</div>
	{:else}
		{#each reports as report (report.id)}
			{#if report.component}
				<!-- Plugin-provided web component -->
				<div class="rounded-lg border border-border bg-card overflow-hidden">
					<h2 class="px-4 py-3 text-base font-semibold text-foreground">{report.title}</h2>
					<ReportComponentWrapper {report} />
				</div>
			{:else}
				<!-- Default renderer for core reports -->
				{@const config = statusConfig[report.status] || statusConfig.success}
				<div class="rounded-lg border border-border bg-card overflow-hidden">
					<h2 class="px-4 py-3 text-base font-semibold text-foreground">{report.title}</h2>

					<!-- Status banner -->
					<div class="flex items-center gap-2 px-4 py-2.5 {config.bg} {config.text}">
						<svelte:component this={config.icon} size={16} />
						<span class="text-sm font-medium">{report.message}</span>
					</div>

					<!-- Detail items -->
					{#if report.items.length > 0}
						<div class="divide-y divide-border">
							{#each report.items as item}
								<div class="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
									{#if 'route' in item}
										<div class="flex items-center gap-2 min-w-0">
											<ShieldAlert size={14} class="shrink-0 text-muted-foreground" />
											<span class="font-medium text-primary truncate">{item.route}</span>
										</div>
										{#if item.field}
											<span class="shrink-0 text-muted-foreground">content: {item.field}</span>
										{/if}
									{:else if 'file' in item}
										<span class="font-medium text-foreground truncate">{item.file}</span>
										{#if item.error}
											<span class="shrink-0 text-destructive">{item.error}</span>
										{/if}
									{:else}
										<span class="text-foreground">{JSON.stringify(item)}</span>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		{/each}
	{/if}
</div>
