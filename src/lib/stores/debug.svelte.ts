/**
 * Developer debug log for admin-next (admin2#66).
 *
 * Grav's classic admin showed a Clockwork/DebugBar toolbar by injecting HTML
 * into the page. The SPA never renders that, so there was no visual debug story
 * — and `dump()` inside `onApi*` hooks corrupts the JSON response body.
 *
 * This store records every API round-trip the client makes (method, path,
 * status, duration) along with the `X-Clockwork-Id` header that Grav core
 * already emits on every response when `system.debugger.enabled` is true. The
 * floating DebugPanel reads it and, for any request carrying a Clockwork id,
 * pulls the full server-side profile (log messages, timeline, queries) from
 * `/__clockwork/{id}` — so plugin authors get `dump()`-style inspection via
 * `$grav['debugger']->addMessage()` without breaking the response.
 *
 * Fetched profiles are cached here so the per-request detail view and the
 * aggregated Console stream share one fetch per request.
 *
 * `clockworkSeen` flips true the moment any response carries a Clockwork id,
 * which is exactly when the debugger is enabled — so the panel's launcher
 * gates on it with no extra config plumbing.
 */
/** One Server-Timing phase: `boot;dur=5.4;desc="Grav boot"`. */
export interface ServerTimingPhase {
	name: string;
	label: string;
	durationMs: number;
}

export interface DebugRequest {
	id: number;
	method: string;
	path: string;
	status: number;
	durationMs: number;
	clockworkId: string | null;
	/**
	 * Server-reported phase timings (Grav boot, auth, controller, total) parsed
	 * from the API's `Server-Timing` header. Lets the panel show where each
	 * request's time went on the server vs. network — notably how much of a cold
	 * (cache-off) request is Grav boot (admin2#65).
	 */
	serverTiming: ServerTimingPhase[] | null;
	at: number;
}

/**
 * Parse a `Server-Timing` header into ordered phases. Tolerates missing
 * `desc` and metric-only entries; returns null when nothing parses.
 */
export function parseServerTiming(header: string | null): ServerTimingPhase[] | null {
	if (!header) return null;
	const phases: ServerTimingPhase[] = [];
	for (const raw of header.split(',')) {
		const parts = raw.split(';');
		const name = parts[0]?.trim();
		if (!name) continue;
		let durationMs = NaN;
		let label = name;
		for (const p of parts.slice(1)) {
			const eq = p.indexOf('=');
			if (eq === -1) continue;
			const key = p.slice(0, eq).trim();
			const val = p.slice(eq + 1).trim().replace(/^"|"$/g, '');
			if (key === 'dur') durationMs = parseFloat(val);
			else if (key === 'desc') label = val;
		}
		if (Number.isNaN(durationMs)) continue;
		phases.push({ name, label, durationMs });
	}
	return phases.length ? phases : null;
}

/** One Clockwork log entry (the `log` array of /__clockwork/{id}). */
export interface ClockworkLog {
	message: string;
	level?: string;
	time?: number;
}

/** One Clockwork timeline event (the `timelineData` array). */
export interface ClockworkTimelineEvent {
	description: string;
	start: number;
	end: number;
	duration: number;
}

export interface ClockworkData {
	log?: ClockworkLog[];
	timelineData?: ClockworkTimelineEvent[];
	databaseQueries?: unknown[];
	responseDuration?: number;
	memoryUsage?: number;
}

/** A flattened log line for the cross-request Console view. */
export interface ConsoleEntry {
	id: string;
	reqId: number;
	path: string;
	level: string;
	message: string;
	time: number;
}

const MAX_ENTRIES = 60;
const MAX_CONSOLE = 400;

class DebugStore {
	requests = $state<DebugRequest[]>([]);
	/** True once any API response has carried an X-Clockwork-Id (⇒ debugger on). */
	clockworkSeen = $state(false);
	/** Panel open/closed — toggled by the launcher. */
	open = $state(false);
	/** Active top-level view. */
	view = $state<'requests' | 'console'>('requests');
	/** Aggregated log messages across every fetched request (newest first). */
	consoleEntries = $state<ConsoleEntry[]>([]);

	#seq = 0;
	#cache = new Map<string, ClockworkData>();
	#ingested = new Set<string>();

	record(entry: Omit<DebugRequest, 'id'>): void {
		const id = ++this.#seq;
		// Newest first; cap the ring buffer so a long session can't grow unbounded.
		this.requests = [{ id, ...entry }, ...this.requests].slice(0, MAX_ENTRIES);
		if (entry.clockworkId) {
			this.clockworkSeen = true;
		}
	}

	/** Cached Clockwork profile for a request id, if already fetched. */
	getCached(clockworkId: string): ClockworkData | undefined {
		return this.#cache.get(clockworkId);
	}

	/**
	 * Store a fetched Clockwork profile and merge its log into the Console
	 * stream (once per request id).
	 */
	cacheClockwork(req: DebugRequest, data: ClockworkData): void {
		if (!req.clockworkId) return;
		this.#cache.set(req.clockworkId, data);
		if (this.#ingested.has(req.clockworkId)) return;
		this.#ingested.add(req.clockworkId);

		const entries: ConsoleEntry[] = (data.log ?? []).map((l, i) => ({
			id: `${req.clockworkId}-${i}`,
			reqId: req.id,
			path: req.path,
			level: l.level ?? 'info',
			message: String(l.message ?? ''),
			time: l.time ?? 0,
		}));
		if (entries.length === 0) return;
		this.consoleEntries = [...entries, ...this.consoleEntries]
			.sort((a, b) => b.time - a.time)
			.slice(0, MAX_CONSOLE);
	}

	clear(): void {
		this.requests = [];
		this.consoleEntries = [];
		this.#ingested.clear();
		this.#cache.clear();
	}

	toggle(): void {
		this.open = !this.open;
	}
}

export const debug = new DebugStore();
