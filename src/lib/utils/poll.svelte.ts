/**
 * Polling registry — thin wrapper around setInterval with:
 *   - Auto-pause on tab hidden (visibilitychange) to avoid wasted calls
 *   - Start/stop lifecycle that survives multiple $effect runs
 *   - Synchronous first fetch so callers get initial data without a delay
 *
 * Usage:
 *
 *   const poller = usePoll(() => loadStats(), 5000);
 *   onMount(() => { poller.start(); return () => poller.stop(); });
 *
 * Set `pauseWhenHidden: false` to keep polling while the tab is in the
 * background (rare — most dashboards shouldn't).
 */

export interface PollOptions {
	/** If false, keep polling even when document.hidden is true. Default true. */
	pauseWhenHidden?: boolean;
	/** Run the fetcher immediately on start(). Default true. */
	runImmediately?: boolean;
}

export interface Poller {
	start(): void;
	stop(): void;
	/** Trigger the fetcher once, outside the schedule (e.g. after a mutation). */
	poke(): void;
	readonly running: boolean;
}

export function usePoll(
	fetcher: () => unknown | Promise<unknown>,
	intervalMs: number,
	options: PollOptions = {},
): Poller {
	const pauseWhenHidden = options.pauseWhenHidden ?? true;
	const runImmediately = options.runImmediately ?? true;

	let timer: ReturnType<typeof setInterval> | null = null;
	let started = false;
	let visibilityHandler: (() => void) | null = null;

	let inFlight = false;
	async function tick() {
		// Coalesce overlapping calls — if a fetch is still running, skip.
		if (inFlight) return;
		inFlight = true;
		try {
			await fetcher();
		} catch {
			// Fetcher swallows its own errors; we don't want a failed poll
			// to tear down the timer.
		} finally {
			inFlight = false;
		}
	}

	function startTimer() {
		if (timer !== null) return;
		timer = setInterval(tick, intervalMs);
	}

	function stopTimer() {
		if (timer !== null) {
			clearInterval(timer);
			timer = null;
		}
	}

	function attachVisibilityListener() {
		if (!pauseWhenHidden || typeof document === 'undefined') return;
		visibilityHandler = () => {
			if (!started) return;
			if (document.hidden) {
				stopTimer();
			} else {
				// Fire once on re-show to catch up, then resume the schedule.
				tick();
				startTimer();
			}
		};
		document.addEventListener('visibilitychange', visibilityHandler);
	}

	function detachVisibilityListener() {
		if (visibilityHandler && typeof document !== 'undefined') {
			document.removeEventListener('visibilitychange', visibilityHandler);
			visibilityHandler = null;
		}
	}

	return {
		start() {
			if (started) return;
			started = true;
			attachVisibilityListener();
			if (runImmediately) tick();
			// If the tab is hidden at start time, don't start the timer — the
			// visibility handler will start it when the user comes back.
			if (!pauseWhenHidden || typeof document === 'undefined' || !document.hidden) {
				startTimer();
			}
		},
		stop() {
			started = false;
			stopTimer();
			detachVisibilityListener();
		},
		poke() { tick(); },
		get running() { return started; },
	};
}
