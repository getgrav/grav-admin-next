<script lang="ts">
	import { debug, type DebugRequest, type ClockworkData, type ServerTimingPhase } from '$lib/stores/debug.svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import { Bug, X, Trash2, ChevronRight } from 'lucide-svelte';

	let selected = $state<DebugRequest | null>(null);
	let detail = $state<ClockworkData | null>(null);
	let detailTab = $state<'log' | 'timeline'>('log');
	let detailLoading = $state(false);
	let detailError = $state<string | null>(null);
	let consoleLoading = $state(false);
	let consoleShowAll = $state(false);

	// Grav core logs these five lines on every request boot. They drown out
	// your own dumps in the cross-request console, so hide them by default.
	const BOOT_MESSAGE = [/^Grav v/, /^Environment Name:/, /^System Configuration$/, /^Plugins Configuration$/, /^Streams$/];
	function isBoot(message: string): boolean {
		return BOOT_MESSAGE.some((re) => re.test(message));
	}

	const consoleVisible = $derived(
		debug.consoleEntries.filter((e) => consoleShowAll || e.level !== 'info' || !isBoot(e.message)),
	);

	function statusClass(status: number): string {
		if (status === 0 || status >= 500) return 'text-destructive';
		if (status >= 400) return 'text-warning';
		if (status >= 200 && status < 300) return 'text-success';
		return 'text-muted-foreground';
	}

	function levelClass(level: string): string {
		if (level === 'error' || level === 'critical') return 'text-destructive';
		if (level === 'warning' || level === 'notice') return 'text-warning';
		if (level === 'debug') return 'text-muted-foreground';
		return 'text-success';
	}

	/** Fetch + cache a request's Clockwork profile (shared by detail + console). */
	async function fetchClockwork(req: DebugRequest): Promise<ClockworkData | null> {
		if (!req.clockworkId) return null;
		const cached = debug.getCached(req.clockworkId);
		if (cached) return cached;
		// Clockwork's metadata route is served by Grav core before auth, on the
		// same origin as the admin — a plain fetch returns the full profile.
		const url = `${auth.serverUrl}/__clockwork/${req.clockworkId}`;
		const res = await fetch(url, { headers: { Accept: 'application/json' } });
		if (!res.ok) throw new Error(`Clockwork returned ${res.status}`);
		const data: ClockworkData = await res.json();
		debug.cacheClockwork(req, data);
		return data;
	}

	async function select(req: DebugRequest) {
		selected = req;
		detail = null;
		detailError = null;
		detailTab = 'log';
		if (!req.clockworkId) return;
		detailLoading = true;
		try {
			detail = await fetchClockwork(req);
		} catch (err) {
			detailError = err instanceof Error ? err.message : 'Failed to load Clockwork data';
		} finally {
			detailLoading = false;
		}
	}

	function back() {
		selected = null;
		detail = null;
		detailError = null;
	}

	// Pull the server-side profile for recent requests so the Console fills in
	// without having to click each one. Capped so a long session can't fan out
	// into dozens of fetches at once.
	async function loadConsole() {
		consoleLoading = true;
		try {
			const targets = debug.requests.filter((r) => r.clockworkId && !debug.getCached(r.clockworkId)).slice(0, 25);
			await Promise.all(targets.map((r) => fetchClockwork(r).catch(() => null)));
		} finally {
			consoleLoading = false;
		}
	}

	// Auto-load the console the first time it's opened.
	$effect(() => {
		if (debug.open && debug.view === 'console' && !consoleLoading) {
			const pending = debug.requests.some((r) => r.clockworkId && !debug.getCached(r.clockworkId));
			if (pending) loadConsole();
		}
	});

	// Fixed colour per known phase so the same phase always reads the same.
	// Covers the API router's own phases (boot/auth/route/controller, present
	// when Grav's debugger is OFF) — anything unrecognised, including Grav core's
	// per-processor phases when the debugger is ON, cycles through the palette.
	const PHASE_COLOR: Record<string, string> = {
		boot: 'bg-primary',
		auth: 'bg-warning',
		route: 'bg-muted-foreground',
		controller: 'bg-success',
	};
	const PALETTE = ['bg-primary', 'bg-warning', 'bg-success', 'bg-destructive', 'bg-secondary', 'bg-muted-foreground'];

	// Names that represent the whole-request denominator rather than a segment:
	// our own synthetic "total", and Grav core's wrapping "app" (Application).
	const TOTAL_NAMES = new Set(['total', 'app']);

	function timingTotal(phases: ServerTimingPhase[]): number {
		const t = phases.find((p) => TOTAL_NAMES.has(p.name));
		if (t) return t.durationMs;
		return phases.reduce((sum, p) => sum + p.durationMs, 0);
	}

	// Build a stacked-bar segment per phase (excluding the denominator). The
	// #65 at-a-glance view: how much of a request is Grav boot vs. the rest.
	function timingSegments(phases: ServerTimingPhase[]) {
		const total = timingTotal(phases);
		const span = total || 1;
		const segs = phases
			.filter((p) => !TOTAL_NAMES.has(p.name))
			.map((p, i) => ({
				name: p.name,
				label: p.label,
				durationMs: p.durationMs,
				pct: (p.durationMs / span) * 100,
				color: PHASE_COLOR[p.name] ?? PALETTE[i % PALETTE.length],
			}));
		// When the phases come from a wrapper total (Grav's "Application") the
		// named segments don't account for all of it — the rest is request work
		// not broken into sub-timers. Show that remainder so the bar reads true.
		const accounted = segs.reduce((sum, s) => sum + s.durationMs, 0);
		const remainder = total - accounted;
		if (total > 0 && remainder / total > 0.02) {
			segs.push({ name: 'other', label: 'Other', durationMs: remainder, pct: (remainder / span) * 100, color: 'bg-muted' });
		}
		return segs;
	}

	// Timeline geometry: map each event's [start,end] (epoch seconds) onto a
	// 0–100% track spanning the whole request.
	function timelineRows(events: ClockworkData['timelineData']) {
		if (!events || events.length === 0) return [];
		const minStart = Math.min(...events.map((e) => e.start));
		const maxEnd = Math.max(...events.map((e) => e.end));
		const span = maxEnd - minStart || 1;
		return events.map((e) => ({
			description: e.description,
			durationMs: e.duration,
			left: ((e.start - minStart) / span) * 100,
			width: Math.max(((e.end - e.start) / span) * 100, 0.6),
		}));
	}
</script>

{#if debug.clockworkSeen}
	<!-- Launcher: bottom-left (the classic Grav debug-bar spot). Brand-colored so
	     it stands out against the chrome (admin2#66). Only mounts once a Clockwork
	     id has been seen, i.e. the Grav debugger is enabled. -->
	<button
		class="fixed bottom-4 start-4 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-colors hover:bg-primary/90"
		title="Debug panel"
		onclick={() => debug.toggle()}
	>
		<Bug size={18} />
	</button>
{/if}

{#if debug.open}
	<div
		class="fixed bottom-16 start-4 z-40 flex max-h-[72vh] w-[440px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-2xl"
	>
		<!-- Header -->
		<div class="flex items-center justify-between border-b border-border px-3 py-2">
			<div class="flex items-center gap-2 text-sm font-semibold">
				<Bug size={15} />
				<span>API Debug</span>
			</div>
			<div class="flex items-center gap-1">
				<button class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" title="Clear" onclick={() => { debug.clear(); back(); }}>
					<Trash2 size={14} />
				</button>
				<button class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" title="Close" onclick={() => debug.toggle()}>
					<X size={15} />
				</button>
			</div>
		</div>

		<!-- Top-level tabs -->
		<div class="flex border-b border-border text-xs font-medium">
			<button
				class="px-3 py-1.5 {debug.view === 'requests' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'}"
				onclick={() => { debug.view = 'requests'; }}
			>Requests <span class="text-muted-foreground">{debug.requests.length}</span></button>
			<button
				class="px-3 py-1.5 {debug.view === 'console' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'}"
				onclick={() => { debug.view = 'console'; }}
			>Console <span class="text-muted-foreground">{consoleVisible.length}</span></button>
		</div>

		{#if debug.view === 'console'}
			<!-- Cross-request message console -->
			<div class="flex items-center justify-between border-b border-border px-3 py-1 text-[11px] text-muted-foreground">
				<span>{consoleLoading ? 'Loading…' : 'Server log & dumps across requests'}</span>
				<label class="flex items-center gap-1">
					<input type="checkbox" bind:checked={consoleShowAll} class="h-3 w-3" />
					show boot messages
				</label>
			</div>
			<div class="flex-1 overflow-y-auto p-2 font-mono text-[11px]">
				{#if consoleVisible.length === 0}
					<p class="p-3 text-center text-muted-foreground">
						{consoleLoading ? 'Loading messages…' : 'No messages yet. Use $grav[\'debugger\']->addMessage($var, \'info\') in your code.'}
					</p>
				{:else}
					{#each consoleVisible as entry (entry.id)}
						<div class="border-b border-border/40 px-1 py-1">
							<span class="me-2 uppercase {levelClass(entry.level)}">{entry.level}</span>
							<span class="whitespace-pre-wrap break-words">{entry.message}</span>
							<span class="ms-1 text-muted-foreground/70">· {entry.path}</span>
						</div>
					{/each}
				{/if}
			</div>
		{:else if !selected}
			<!-- Request list -->
			<div class="flex-1 overflow-y-auto">
				{#if debug.requests.length === 0}
					<p class="p-4 text-center text-xs text-muted-foreground">No requests recorded yet.</p>
				{:else}
					{#each debug.requests as req (req.id)}
						<button
							class="flex w-full items-center gap-2 border-b border-border/50 px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent"
							onclick={() => select(req)}
						>
							<span class="w-12 shrink-0 font-mono font-semibold text-muted-foreground">{req.method}</span>
							<span class="w-8 shrink-0 font-mono font-semibold {statusClass(req.status)}">{req.status || 'ERR'}</span>
							<span class="min-w-0 flex-1 truncate font-mono">{req.path}</span>
							<span class="shrink-0 tabular-nums text-muted-foreground">{req.durationMs}ms</span>
							{#if req.clockworkId}
								<ChevronRight size={13} class="shrink-0 text-muted-foreground" />
							{/if}
						</button>
					{/each}
				{/if}
			</div>
			<div class="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
				Click a request for its server-side Clockwork profile.
			</div>
		{:else}
			<!-- Request detail -->
			<div class="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs">
				<button class="text-muted-foreground hover:text-foreground" onclick={back}>← Back</button>
				<span class="truncate font-mono">{selected.method} {selected.path}</span>
			</div>

			{#if selected.serverTiming}
				<!-- Server-Timing phase breakdown (admin2#65): always available, no
				     Clockwork required. Stacked bar + per-phase legend. -->
				<div class="border-b border-border px-3 py-2">
					<div class="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
						<span>Server phases</span>
						<span class="tabular-nums">{Math.round(timingTotal(selected.serverTiming))}ms total</span>
					</div>
					<div class="flex h-2.5 w-full overflow-hidden rounded bg-muted/50">
						{#each timingSegments(selected.serverTiming) as seg}
							<div class="{seg.color} h-full" style="width:{seg.pct}%" title="{seg.label}: {seg.durationMs.toFixed(1)}ms"></div>
						{/each}
					</div>
					<div class="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
						{#each timingSegments(selected.serverTiming) as seg}
							<span class="flex items-center gap-1">
								<span class="{seg.color} inline-block h-2 w-2 rounded-sm"></span>
								<span class="text-muted-foreground">{seg.label}</span>
								<span class="tabular-nums text-foreground">{seg.durationMs < 1 ? seg.durationMs.toFixed(1) : Math.round(seg.durationMs)}ms</span>
							</span>
						{/each}
					</div>
				</div>
			{/if}

			{#if !selected.clockworkId}
				<div class="flex-1 overflow-y-auto p-3 text-xs">
					<p class="text-muted-foreground">No Clockwork id on this response — the debugger may have been off when it ran.</p>
				</div>
			{:else if detailLoading}
				<div class="flex-1 p-3 text-xs text-muted-foreground">Loading Clockwork profile…</div>
			{:else if detailError}
				<div class="flex-1 p-3 text-xs text-destructive">{detailError}</div>
			{:else if detail}
				<!-- Summary -->
				<div class="flex flex-wrap gap-x-4 gap-y-1 border-b border-border px-3 py-1.5 text-[11px] text-muted-foreground">
					{#if detail.responseDuration != null}<span>Server <span class="text-foreground tabular-nums">{Math.round(detail.responseDuration)}ms</span></span>{/if}
					{#if detail.databaseQueries}<span>Queries <span class="text-foreground tabular-nums">{detail.databaseQueries.length}</span></span>{/if}
					{#if detail.memoryUsage != null}<span>Memory <span class="text-foreground tabular-nums">{(detail.memoryUsage / 1048576).toFixed(1)}MB</span></span>{/if}
				</div>
				<!-- Detail sub-tabs -->
				<div class="flex border-b border-border text-[11px] font-medium">
					<button class="px-3 py-1 {detailTab === 'log' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'}" onclick={() => { detailTab = 'log'; }}>Log {detail.log?.length ?? 0}</button>
					<button class="px-3 py-1 {detailTab === 'timeline' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'}" onclick={() => { detailTab = 'timeline'; }}>Timeline {detail.timelineData?.length ?? 0}</button>
				</div>

				<div class="flex-1 overflow-y-auto p-2 text-xs">
					{#if detailTab === 'log'}
						{#if detail.log && detail.log.length > 0}
							<div class="space-y-1 font-mono text-[11px]">
								{#each detail.log as entry}
									<div class="rounded border border-border/60 bg-muted/40 p-2">
										<span class="me-2 uppercase {levelClass(entry.level ?? 'info')}">{entry.level ?? 'info'}</span>
										<span class="whitespace-pre-wrap break-words">{entry.message}</span>
									</div>
								{/each}
							</div>
						{:else}
							<p class="text-muted-foreground">No log messages. Use <span class="font-mono">$grav['debugger']-&gt;addMessage($var, 'info')</span> in your hook to inspect values here.</p>
						{/if}
					{:else if detailTab === 'timeline'}
						{#if detail.timelineData && detail.timelineData.length > 0}
							<div class="space-y-1">
								{#each timelineRows(detail.timelineData) as row}
									<div class="flex items-center gap-2">
										<span class="w-32 shrink-0 truncate text-[11px]" title={row.description}>{row.description}</span>
										<div class="relative h-3 flex-1 rounded bg-muted/50">
											<div class="absolute top-0 h-3 rounded bg-primary/70" style="left:{row.left}%;width:{row.width}%"></div>
										</div>
										<span class="w-14 shrink-0 text-end tabular-nums text-[11px] text-muted-foreground">{row.durationMs < 1 ? row.durationMs.toFixed(2) : Math.round(row.durationMs)}ms</span>
									</div>
								{/each}
							</div>
						{:else}
							<p class="text-muted-foreground">No timeline events recorded for this request.</p>
						{/if}
					{/if}
				</div>
			{/if}
		{/if}
	</div>
{/if}
