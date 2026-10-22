/**
 * Mercure subscription over a streaming fetch, so the JWT travels in the
 * Authorization header. EventSource can't set headers, and Mercure 1.x
 * removed the `authorization` query parameter it relied on (a token in a
 * URL also ends up in proxy and access logs). The header works on 0.x hubs
 * too, so this is the only path. Adapted from @Gleydar's Mercure 1.x fork
 * of grav-plugin-sync-mercure.
 *
 * `protocol` comes from the token response: 1 (Mercure 1.x) subscribes with
 * `match=`, 0 (0.x, or a server too old to say) with `topic=`. A hub that
 * answers 400 is asked once more with the other parameter (0.x rejects
 * `match=`, a modern 1.x hub rejects `topic=`), so a stale answer heals.
 *
 * Reconnects on its own after network errors and hub restarts, resuming
 * from the last event id. A 401/403 is terminal: `onAuthError` fires and the
 * caller re-mints the token and opens a new stream (passing `lastEventId`
 * on, so nothing published in between is skipped where the hub keeps
 * history).
 */

export interface MercureStreamOptions {
	hub: string;
	topics: string[];
	jwt: string;
	protocol?: number;
	/** Resume point carried over from a previous stream. */
	lastEventId?: string;
	onMessage: (data: string) => void;
	onOpen?: () => void;
	onError?: (err: unknown) => void;
	onAuthError?: (status: number) => void;
	/** Test seam; defaults to the global fetch. */
	fetch?: typeof fetch;
}

export interface MercureStream {
	close(): void;
	/** Id of the last event received, for the next stream to resume from. */
	readonly lastEventId: string;
}

const RETRY_MIN_MS = 1000;
const RETRY_MAX_MS = 30_000;

export function openMercureStream(opts: MercureStreamOptions): MercureStream {
	const doFetch = opts.fetch ?? fetch;
	const controller = new AbortController();
	let closed = false;
	let lastEventId = opts.lastEventId ?? '';
	let retryMs = RETRY_MIN_MS;
	let retryTimer: ReturnType<typeof setTimeout> | null = null;
	let useMatch = (opts.protocol ?? 0) >= 1;

	const buildUrl = (): string => {
		const url = new URL(opts.hub, typeof location !== 'undefined' ? location.href : undefined);
		const param = useMatch ? 'match' : 'topic';
		for (const t of opts.topics) url.searchParams.append(param, t);
		return url.toString();
	};

	const request = (): Promise<Response> => {
		const headers: Record<string, string> = {
			Accept: 'text/event-stream',
			Authorization: `Bearer ${opts.jwt}`,
		};
		// 1.x renamed the reconnect query parameter to `last_event_id`, but
		// the request header kept its name on both generations.
		if (lastEventId) headers['Last-Event-ID'] = lastEventId;
		return doFetch(buildUrl(), {
			headers,
			signal: controller.signal,
			credentials: 'omit',
			cache: 'no-store',
			// A redirect would drop (cross-origin) or forward (same-origin)
			// the token; the hub URL must be the real endpoint.
			redirect: 'error',
		});
	};

	const run = async (): Promise<void> => {
		let res = await request();
		if (res.status === 400 && !closed) {
			useMatch = !useMatch;
			res = await request();
		}
		if (res.status === 401 || res.status === 403) {
			closed = true;
			opts.onAuthError?.(res.status);
			return;
		}
		if (!res.ok || !res.body) throw new Error(`Mercure HTTP ${res.status}`);
		opts.onOpen?.();
		retryMs = RETRY_MIN_MS;

		const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
		let buf = '';
		let data: string[] = [];
		let type = '';
		let id: string | null = null;
		for (;;) {
			const { value, done } = await reader.read();
			if (done) break;
			buf += value;
			let nl: number;
			while ((nl = buf.indexOf('\n')) !== -1) {
				let line = buf.slice(0, nl);
				buf = buf.slice(nl + 1);
				if (line.endsWith('\r')) line = line.slice(0, -1);
				if (line === '') {
					if (id !== null) lastEventId = id;
					// Updates published with a custom `type` aren't ours.
					if (data.length && (type === '' || type === 'message') && !closed) opts.onMessage(data.join('\n'));
					data = [];
					type = '';
					id = null;
					continue;
				}
				if (line.startsWith(':')) continue;
				const colon = line.indexOf(':');
				const field = colon === -1 ? line : line.slice(0, colon);
				let val = colon === -1 ? '' : line.slice(colon + 1);
				if (val.startsWith(' ')) val = val.slice(1);
				if (field === 'data') data.push(val);
				else if (field === 'event') type = val;
				else if (field === 'id' && !val.includes('\0')) id = val;
				else if (field === 'retry' && /^\d+$/.test(val)) retryMs = Number(val);
			}
		}
		throw new Error('Mercure stream ended');
	};

	const loop = (): void => {
		retryTimer = null;
		if (closed) return;
		run().catch((err) => {
			if (closed || controller.signal.aborted) return;
			opts.onError?.(err);
			retryTimer = setTimeout(loop, retryMs);
			retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
		});
	};
	loop();

	return {
		close() {
			closed = true;
			if (retryTimer) clearTimeout(retryTimer);
			retryTimer = null;
			controller.abort();
		},
		get lastEventId() {
			return lastEventId;
		},
	};
}
