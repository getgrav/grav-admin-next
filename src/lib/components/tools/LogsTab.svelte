<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { getLogs } from '$lib/api/endpoints/tools';
	import type { LogEntry } from '$lib/api/endpoints/tools';
	import { Button } from '$lib/components/ui/button';
	import { RefreshCw, ChevronLeft, ChevronRight } from 'lucide-svelte';

	let entries = $state<LogEntry[]>([]);
	let loading = $state(true);
	let total = $state(0);

	// Filters
	let level = $state('');
	let perPage = $state(50);
	let page = $state(1);

	const totalPages = $derived(Math.max(1, Math.ceil(total / perPage)));

	const levelColors: Record<string, string> = {
		EMERGENCY: 'bg-red-600 text-white',
		ALERT: 'bg-red-500 text-white',
		CRITICAL: 'bg-red-500 text-white',
		ERROR: 'bg-destructive text-destructive-foreground',
		WARNING: 'bg-amber-500 text-white',
		NOTICE: 'bg-blue-500 text-white',
		INFO: 'bg-primary text-primary-foreground',
		DEBUG: 'bg-muted text-muted-foreground',
	};

	async function load() {
		loading = true;
		try {
			const result = await getLogs({ page, per_page: perPage, level: level || undefined });
			entries = result.data || [];
			total = result.meta?.total ?? 0;
		} catch {
			toast.error('Failed to load logs');
		} finally {
			loading = false;
		}
	}

	function handleFilterChange() {
		page = 1;
		load();
	}

	function formatDate(dateStr: string): string {
		const d = new Date(dateStr);
		return d.toLocaleString(undefined, {
			month: 'short', day: 'numeric',
			hour: '2-digit', minute: '2-digit', second: '2-digit',
		});
	}

	onMount(load);
</script>

<div class="space-y-4">
	<!-- Filters -->
	<div class="flex flex-wrap items-center gap-3">
		<select
			class="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
			bind:value={level}
			onchange={handleFilterChange}
		>
			<option value="">All Levels</option>
			<option value="EMERGENCY">Emergency</option>
			<option value="ALERT">Alert</option>
			<option value="CRITICAL">Critical</option>
			<option value="ERROR">Error</option>
			<option value="WARNING">Warning</option>
			<option value="NOTICE">Notice</option>
			<option value="INFO">Info</option>
			<option value="DEBUG">Debug</option>
		</select>

		<select
			class="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
			bind:value={perPage}
			onchange={handleFilterChange}
		>
			<option value={25}>25 lines</option>
			<option value={50}>50 lines</option>
			<option value={100}>100 lines</option>
			<option value={200}>200 lines</option>
		</select>

		<Button size="sm" variant="outline" onclick={load}>
			<RefreshCw size={14} />
			Refresh
		</Button>

		<span class="ml-auto text-xs text-muted-foreground">
			{total} total entries
		</span>
	</div>

	<!-- Log Table -->
	<div class="rounded-lg border border-border bg-card">
		{#if loading}
			<div class="p-8 text-center text-sm text-muted-foreground">Loading logs...</div>
		{:else if entries.length === 0}
			<div class="p-8 text-center text-sm text-muted-foreground">No log entries found.</div>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b border-border text-left text-xs font-medium text-muted-foreground">
							<th class="whitespace-nowrap px-4 py-3">Date</th>
							<th class="px-4 py-3">Level</th>
							<th class="px-4 py-3">Message</th>
						</tr>
					</thead>
					<tbody>
						{#each entries as entry, i (i)}
							<tr class="border-b border-border last:border-0 hover:bg-muted/30">
								<td class="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-muted-foreground">
									{formatDate(entry.date)}
								</td>
								<td class="px-4 py-2.5">
									<span class="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase {levelColors[entry.level] ?? 'bg-muted text-muted-foreground'}">
										{entry.level}
									</span>
								</td>
								<td class="max-w-[600px] truncate px-4 py-2.5 text-foreground" title={entry.message}>
									{entry.message}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>

	<!-- Pagination -->
	{#if totalPages > 1}
		<div class="flex items-center justify-between text-sm">
			<span class="text-xs text-muted-foreground">
				Page {page} of {totalPages}
			</span>
			<div class="flex items-center gap-1">
				<Button size="sm" variant="outline" disabled={page <= 1} onclick={() => { page--; load(); }}>
					<ChevronLeft size={14} />
				</Button>
				<Button size="sm" variant="outline" disabled={page >= totalPages} onclick={() => { page++; load(); }}>
					<ChevronRight size={14} />
				</Button>
			</div>
		</div>
	{/if}
</div>
