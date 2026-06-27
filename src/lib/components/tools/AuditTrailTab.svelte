<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import {
		getAuditStatus,
		getAuditEvents,
		getAuditFacets,
		getAuditExportUrl,
		type AuditEvent,
		type AuditStatus,
		type AuditFacets,
		type AuditEventFilters,
	} from '$lib/api/endpoints/audit';
	import { Button } from '$lib/components/ui/button';
	import { RefreshCw, Search, X, Download } from 'lucide-svelte';
	import DirectionalIcon from '$lib/components/ui/DirectionalIcon.svelte';
	import AuditDiff from './AuditDiff.svelte';

	// Split a row's context into the field-change diff (rendered as a colored
	// diff) and any remaining scalar hints (reason, method, lang…).
	type ChangeMap = Record<string, { old: unknown; new: unknown }>;
	function splitContext(context: Record<string, unknown> | null): { changes: ChangeMap | null; rest: Record<string, unknown> } {
		if (!context) return { changes: null, rest: {} };
		const { changes, ...rest } = context;
		return { changes: (changes as ChangeMap) ?? null, rest };
	}

	let status = $state<AuditStatus | null>(null);
	let entries = $state<AuditEvent[]>([]);
	let facets = $state<AuditFacets>({ events: [], actors: [] });
	let loading = $state(true);
	let total = $state(0);
	let expandedRows = $state<Set<number>>(new Set());

	// Filters
	let event = $state('');
	let severity = $state('');
	let actor = $state('');
	let from = $state(''); // yyyy-mm-dd
	let to = $state('');
	let perPage = $state(50);
	let page = $state(1);
	let search = $state('');
	let searchInput = $state('');
	let searchTimeout: ReturnType<typeof setTimeout> | null = null;

	const totalPages = $derived(Math.max(1, Math.ceil(total / perPage)));

	const severityColors: Record<string, string> = {
		error: 'bg-red-600/10 text-red-700 dark:bg-red-500/15 dark:text-red-300',
		warning: 'bg-amber-600/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
		notice: 'bg-blue-600/10 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
		info: 'bg-muted text-muted-foreground',
	};

	// Map a typed event code to a readable label. Falls back to the raw code so
	// plugin-fired events that aren't in the table still render sensibly.
	const eventLabels: Record<string, string> = {
		'user.login': 'Login',
		'user.login.failed': 'Failed login',
		'user.logout': 'Logout',
		'user.password.reset': 'Password reset',
		'page.create': 'Page created',
		'page.update': 'Page updated',
		'page.delete': 'Page deleted',
		'page.move': 'Page moved',
		'page.translate': 'Page translated',
		'pages.reorder': 'Pages reordered',
		'media.upload': 'Media uploaded',
		'media.delete': 'Media deleted',
		'user.create': 'User created',
		'user.update': 'User updated',
		'user.delete': 'User deleted',
		'group.create': 'Group created',
		'group.update': 'Group updated',
		'group.delete': 'Group deleted',
		'config.update': 'Config updated',
		'gpm.install': 'Package installed',
		'gpm.update': 'Package updated',
		'gpm.remove': 'Package removed',
		'grav.upgrade': 'Grav upgraded',
	};

	function eventLabel(code: string): string {
		return eventLabels[code] ?? code;
	}

	// Build the filter payload shared by the events query and the export links.
	const filters = $derived<AuditEventFilters>({
		event: event || undefined,
		severity: severity || undefined,
		actor: actor || undefined,
		q: search || undefined,
		from: from ? new Date(from + 'T00:00:00').getTime() : undefined,
		to: to ? new Date(to + 'T23:59:59').getTime() : undefined,
	});

	const csvUrl = $derived(getAuditExportUrl('csv', filters));
	const jsonUrl = $derived(getAuditExportUrl('json', filters));

	// Visible page numbers (same windowing as LogsTab).
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
			if (start > 2) pages.push(-1);
			for (let i = start; i <= end; i++) pages.push(i);
			if (end < totalPages - 1) pages.push(-1);
			pages.push(totalPages);
		}
		return pages;
	})());

	async function load() {
		loading = true;
		try {
			const result = await getAuditEvents({ ...filters, page, per_page: perPage });
			entries = result.data || [];
			total = result.meta?.pagination?.total ?? 0;
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.TOOLS.AUDIT.FAILED_TO_LOAD'));
		} finally {
			loading = false;
		}
	}

	function handleFilterChange() {
		page = 1;
		expandedRows = new Set();
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

	function toggleRow(id: number) {
		const next = new Set(expandedRows);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		expandedRows = next;
	}

	function formatDate(ms: number): string {
		return new Date(ms).toLocaleString(undefined, {
			month: 'short', day: 'numeric', year: 'numeric',
			hour: '2-digit', minute: '2-digit', second: '2-digit',
		});
	}

	onMount(async () => {
		try {
			status = await getAuditStatus();
		} catch {
			/* status drives only the header note; ignore failures */
		}
		try {
			facets = await getAuditFacets();
		} catch {
			/* facets are optional filter sugar */
		}
		await load();
	});
</script>

<div class="space-y-4">
	<p class="text-xs text-muted-foreground">
		{i18n.t('ADMIN_NEXT.TOOLS.AUDIT.DESCRIPTION')}
		{#if status?.coverage === 'detailed'}
			<span class="ms-1 rounded bg-muted px-1.5 py-0.5 font-medium">{i18n.t('ADMIN_NEXT.TOOLS.AUDIT.COVERAGE_DETAILED')}</span>
		{/if}
	</p>

	<!-- Filters -->
	<div class="flex flex-wrap items-center gap-3">
		<div class="relative">
			<Search size={14} class="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
			<input
				type="text"
				class="h-9 rounded-md border border-input bg-background ps-8 pe-8 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
				style="width: 220px;"
				placeholder={i18n.t('ADMIN_NEXT.TOOLS.AUDIT.SEARCH_PLACEHOLDER')}
				value={searchInput}
				oninput={handleSearchInput}
				onkeydown={(e) => { if (e.key === 'Escape') clearSearch(); }}
			/>
			{#if searchInput}
				<button class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onclick={clearSearch}>
					<X size={14} />
				</button>
			{/if}
		</div>

		<select class="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground" bind:value={event} onchange={handleFilterChange} aria-label={i18n.t('ADMIN_NEXT.TOOLS.AUDIT.EVENT')}>
			<option value="">{i18n.t('ADMIN_NEXT.TOOLS.AUDIT.ALL_EVENTS')}</option>
			{#each facets.events as ev (ev)}
				<option value={ev}>{eventLabel(ev)}</option>
			{/each}
		</select>

		<select class="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground" bind:value={severity} onchange={handleFilterChange} aria-label={i18n.t('ADMIN_NEXT.TOOLS.AUDIT.SEVERITY')}>
			<option value="">{i18n.t('ADMIN_NEXT.TOOLS.AUDIT.ALL_SEVERITIES')}</option>
			<option value="info">Info</option>
			<option value="notice">Notice</option>
			<option value="warning">Warning</option>
			<option value="error">Error</option>
		</select>

		<input type="date" class="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground" bind:value={from} onchange={handleFilterChange} aria-label={i18n.t('ADMIN_NEXT.TOOLS.AUDIT.FROM')} />
		<input type="date" class="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground" bind:value={to} onchange={handleFilterChange} aria-label={i18n.t('ADMIN_NEXT.TOOLS.AUDIT.TO')} />

		<select class="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground" bind:value={perPage} onchange={handleFilterChange}>
			<option value={25}>25</option>
			<option value={50}>50</option>
			<option value={100}>100</option>
			<option value={200}>200</option>
		</select>

		<Button size="sm" variant="outline" onclick={load}>
			<RefreshCw size={14} />
			{i18n.t('ADMIN_NEXT.TOOLS.AUDIT.REFRESH')}
		</Button>

		<div class="ms-auto flex items-center gap-2">
			<a href={csvUrl} class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground" download>
				<Download size={13} /> CSV
			</a>
			<a href={jsonUrl} class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground" download>
				<Download size={13} /> JSON
			</a>
		</div>
	</div>

	<!-- Table -->
	<div class="rounded-lg border border-border bg-card">
		{#if loading}
			<div class="p-8 text-center text-sm text-muted-foreground">{i18n.t('ADMIN_NEXT.TOOLS.AUDIT.LOADING')}</div>
		{:else if entries.length === 0}
			<div class="p-8 text-center text-sm text-muted-foreground">{i18n.t('ADMIN_NEXT.TOOLS.AUDIT.NO_ENTRIES')}</div>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b border-border text-start text-xs font-medium text-muted-foreground">
							<th class="whitespace-nowrap px-4 py-3 text-start">{i18n.t('ADMIN_NEXT.TOOLS.AUDIT.WHEN')}</th>
							<th class="px-4 py-3 text-start">{i18n.t('ADMIN_NEXT.TOOLS.AUDIT.ACTOR')}</th>
							<th class="px-4 py-3 text-start">{i18n.t('ADMIN_NEXT.TOOLS.AUDIT.EVENT')}</th>
							<th class="px-4 py-3 text-start">{i18n.t('ADMIN_NEXT.TOOLS.AUDIT.TARGET')}</th>
							<th class="px-4 py-3 text-start">{i18n.t('ADMIN_NEXT.TOOLS.AUDIT.IP')}</th>
						</tr>
					</thead>
					<tbody>
						{#each entries as entry (entry.id)}
							<tr class="border-b border-border last:border-0 cursor-pointer hover:bg-muted/30" onclick={() => toggleRow(entry.id)}>
								<td class="whitespace-nowrap px-4 py-2.5 align-top font-mono text-xs text-muted-foreground">{formatDate(entry.ts)}</td>
								<td class="px-4 py-2.5 align-top">
									<span class="text-foreground">{entry.actor_name ?? '—'}</span>
									{#if entry.auth_method === 'apikey'}
										<span class="ms-1 rounded bg-muted px-1 py-0.5 text-[0.625rem] text-muted-foreground">API</span>
									{/if}
								</td>
								<td class="px-4 py-2.5 align-top">
									<span class="inline-flex items-center rounded-md px-2 py-0.5 text-[0.6875rem] font-medium {severityColors[entry.severity] ?? severityColors.info}">
										{eventLabel(entry.event)}
									</span>
								</td>
								<td class="px-4 py-2.5 align-top font-mono text-xs text-muted-foreground">
									{entry.target_id ?? (entry.target_type ?? '—')}
								</td>
								<td class="px-4 py-2.5 align-top font-mono text-xs text-muted-foreground">{entry.ip ?? '—'}</td>
							</tr>
							{#if expandedRows.has(entry.id)}
								{@const split = splitContext(entry.context)}
								<tr class="border-b border-border bg-muted/20">
									<td colspan="5" class="px-4 py-3">
										<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
											<dt class="text-muted-foreground">{i18n.t('ADMIN_NEXT.TOOLS.AUDIT.EVENT_CODE')}</dt>
											<dd class="font-mono text-foreground">{entry.event}</dd>
											<dt class="text-muted-foreground">{i18n.t('ADMIN_NEXT.TOOLS.AUDIT.SEVERITY')}</dt>
											<dd class="text-foreground">{entry.severity}</dd>
											<dt class="text-muted-foreground">{i18n.t('ADMIN_NEXT.TOOLS.AUDIT.ACTOR')}</dt>
											<dd class="text-foreground">{entry.actor_name ?? '—'}{entry.actor_id ? ` (${entry.actor_id})` : ''}{entry.actor_roles.length ? ` · ${entry.actor_roles.join(', ')}` : ''}</dd>
											<dt class="text-muted-foreground">{i18n.t('ADMIN_NEXT.TOOLS.AUDIT.AUTH_METHOD')}</dt>
											<dd class="text-foreground">{entry.auth_method ?? '—'}</dd>
											<dt class="text-muted-foreground">{i18n.t('ADMIN_NEXT.TOOLS.AUDIT.USER_AGENT')}</dt>
											<dd class="break-all text-foreground">{entry.user_agent ?? '—'}</dd>
											{#if split.changes && Object.keys(split.changes).length}
												<dt class="text-muted-foreground">{i18n.t('ADMIN_NEXT.TOOLS.AUDIT.CHANGES')}</dt>
												<dd><AuditDiff changes={split.changes} /></dd>
											{/if}
											{#if Object.keys(split.rest).length}
												<dt class="text-muted-foreground">{i18n.t('ADMIN_NEXT.TOOLS.AUDIT.DETAILS')}</dt>
												<dd>
													<pre class="overflow-x-auto whitespace-pre-wrap break-all rounded bg-background p-2 font-mono text-[0.6875rem] text-foreground">{JSON.stringify(split.rest, null, 2)}</pre>
												</dd>
											{/if}
										</dl>
									</td>
								</tr>
							{/if}
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
				{i18n.t('ADMIN_NEXT.TOOLS.AUDIT.SHOWING')} {((page - 1) * perPage) + 1}–{Math.min(page * perPage, total)} / {total.toLocaleString()}
			</span>
			<div class="flex items-center gap-1">
				<Button size="sm" variant="outline" disabled={page <= 1} onclick={() => goToPage(page - 1)}>
					<DirectionalIcon name="chevron-back" size={14} />
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
					<DirectionalIcon name="chevron-forward" size={14} />
				</Button>
			</div>
		</div>
	{/if}
</div>
