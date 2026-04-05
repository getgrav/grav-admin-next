<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { getLogs } from '$lib/api/endpoints/tools';
	import type { LogEntry } from '$lib/api/endpoints/tools';
	import { Button } from '$lib/components/ui/button';
	import { usePoll } from '$lib/utils/poll.svelte';
	import { RefreshCw, ChevronLeft, ChevronRight, Search, X } from 'lucide-svelte';

	let entries = $state<LogEntry[]>([]);
	let loading = $state(true);
	let total = $state(0);
	let expandedRows = $state<Set<number>>(new Set());

	// Filters — persist level and lines in localStorage
	const stored = typeof localStorage !== 'undefined' ? JSON.parse(localStorage.getItem('grav_logs_prefs') || '{}') : {};
	let level = $state(stored.level ?? '');
	let perPage = $state(Number(stored.perPage) || 50);
	let page = $state(1);
	let search = $state('');
	let searchInput = $state('');
	let searchTimeout: ReturnType<typeof setTimeout> | null = null;
	let autoRefresh = $state(false);
	const poller = usePoll(() => load(), 5000, { runImmediately: false });

	function persistPrefs() {
		localStorage.setItem('grav_logs_prefs', JSON.stringify({ level, perPage: Number(perPage) }));
	}

	function toggleAutoRefresh() {
		autoRefresh = !autoRefresh;
		if (autoRefresh) poller.start();
		else poller.stop();
	}

	onDestroy(() => poller.stop());

	const totalPages = $derived(Math.max(1, Math.ceil(total / perPage)));

	// Generate visible page numbers
	const visiblePages = $derived((() => {
		const pages: number[] = [];
		const maxVisible = 7;
		if (totalPages <= maxVisible) {
			for (let i = 1; i <= totalPages; i++) pages.push(i);
		} else {
			pages.push(1);
			let start = Math.max(2, page - 2);
			let end = Math.min(totalPages - 1, page + 2);
			if (page <= 3) end = Math.min(5, totalPages - 1);
			if (page >= totalPages - 2) start = Math.max(2, totalPages - 4);
			if (start > 2) pages.push(-1); // ellipsis
			for (let i = start; i <= end; i++) pages.push(i);
			if (end < totalPages - 1) pages.push(-1); // ellipsis
			pages.push(totalPages);
		}
		return pages;
	})());

	const levelColors: Record<string, string> = {
		EMERGENCY: 'bg-red-600/10 text-red-700 dark:bg-red-500/15 dark:text-red-300',
		ALERT: 'bg-red-600/10 text-red-700 dark:bg-red-500/15 dark:text-red-300',
		CRITICAL: 'bg-red-600/10 text-red-700 dark:bg-red-500/15 dark:text-red-300',
		ERROR: 'bg-red-600/10 text-red-700 dark:bg-red-500/15 dark:text-red-300',
		WARNING: 'bg-amber-600/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
		NOTICE: 'bg-blue-600/10 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
		INFO: 'bg-primary-600/10 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300',
		DEBUG: 'bg-muted text-muted-foreground',
	};

	async function load() {
		loading = true;
		try {
			const result = await getLogs({ page, per_page: perPage, level: level || undefined, search: search || undefined });
			entries = result.data || [];
			total = result.meta?.pagination?.total ?? 0;
		} catch {
			toast.error('Failed to load logs');
		} finally {
			loading = false;
		}
	}

	function handleFilterChange() {
		page = 1;
		persistPrefs();
		load();
	}

	function handleSearchInput(e: Event) {
		searchInput = (e.target as HTMLInputElement).value;
		if (searchTimeout) clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			search = searchInput;
			handleFilterChange();
		}, 400);
	}

	function clearSearch() {
		searchInput = '';
		search = '';
		handleFilterChange();
	}

	function goToPage(p: number) {
		page = p;
		expandedRows = new Set();
		load();
	}

	function toggleRow(i: number) {
		const next = new Set(expandedRows);
		if (next.has(i)) next.delete(i); else next.add(i);
		expandedRows = next;
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
		<!-- Search -->
		<div class="relative">
			<Search size={14} class="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
			<input
				type="text"
				class="h-9 rounded-md border border-input bg-background pl-8 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
				style="width: 220px;"
				placeholder="Search messages..."
				value={searchInput}
				oninput={handleSearchInput}
				onkeydown={(e) => { if (e.key === 'Escape') clearSearch(); }}
			/>
			{#if searchInput}
				<button
					class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
					onclick={clearSearch}
				>
					<X size={14} />
				</button>
			{/if}
		</div>

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

		<button
			class="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors
				{autoRefresh
					? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
					: 'border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground'}"
			onclick={toggleAutoRefresh}
		>
			<span class="relative flex h-2 w-2">
				{#if autoRefresh}
					<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
				{/if}
				<span class="relative inline-flex h-2 w-2 rounded-full {autoRefresh ? 'bg-emerald-500' : 'bg-muted-foreground/40'}"></span>
			</span>
			Live
		</button>

		<span class="ml-auto text-xs text-muted-foreground">
			{total.toLocaleString()} entries{search ? ` matching "${search}"` : ''}
		</span>
	</div>

	<!-- Log Table -->
	<div class="rounded-lg border border-border bg-card">
		{#if loading}
			<div class="p-8 text-center text-sm text-muted-foreground">Loading logs...</div>
		{:else if entries.length === 0}
			<div class="p-8 text-center text-sm text-muted-foreground">
				{search ? `No log entries matching "${search}".` : 'No log entries found.'}
			</div>
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
							<tr
								class="border-b border-border last:border-0 cursor-pointer hover:bg-muted/30"
								onclick={() => toggleRow(i)}
							>
								<td class="whitespace-nowrap px-4 py-2.5 align-top font-mono text-xs text-muted-foreground">
									{formatDate(entry.date)}
								</td>
								<td class="px-4 py-2.5 align-top">
									<span class="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium {levelColors[entry.level] ?? 'bg-muted text-muted-foreground'}">
										{entry.level}
									</span>
								</td>
								<td class="px-4 py-2.5 text-foreground {expandedRows.has(i) ? 'whitespace-pre-wrap break-all' : 'max-w-[600px] truncate'}">
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
				Showing {((page - 1) * perPage) + 1}–{Math.min(page * perPage, total)} of {total.toLocaleString()}
			</span>
			<div class="flex items-center gap-1">
				<Button size="sm" variant="outline" disabled={page <= 1} onclick={() => goToPage(page - 1)}>
					<ChevronLeft size={14} />
				</Button>
				{#each visiblePages as p, idx (idx)}
					{#if p === -1}
						<span class="px-1.5 text-xs text-muted-foreground">...</span>
					{:else}
						<button
							class="inline-flex h-8 min-w-[2rem] items-center justify-center rounded-md text-xs font-medium transition-colors
								{p === page ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
							onclick={() => goToPage(p)}
						>
							{p}
						</button>
					{/if}
				{/each}
				<Button size="sm" variant="outline" disabled={page >= totalPages} onclick={() => goToPage(page + 1)}>
					<ChevronRight size={14} />
				</Button>
			</div>
		</div>
	{/if}
</div>
