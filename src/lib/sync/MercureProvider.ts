/**
 * Mercure SSE-backed SyncProvider.
 *
 * Strategy:
 *   - On connect, do a single HTTP pull from the sync API to load any
 *     state we missed before the EventSource opens (this is also our
 *     only-when-empty seed mechanism — same as PollingProvider).
 *   - Open one EventSource subscription per channel: `:doc` for Y.Doc
 *     updates and `:aw` for awareness deltas. The server publishes
 *     every push and presence-with-awarenessUpdate event to those
 *     channels via grav-plugin-sync-mercure.
 *   - Pushes still go through the PHP push endpoint — that endpoint
 *     persists the update to the file/sqlite log AND publishes to
 *     the hub. We don't bypass the durable storage path.
 *   - Awareness encoded deltas still go through the PHP presence
 *     endpoint (server publishes to hub on receipt). Polling-style
 *     presence list also remains the source of truth for "who's here".
 *
 * Auth: EventSource doesn't support custom headers in browsers. We pass
 * the JWT issued by /sync/mercure/token as a query string parameter,
 * which the Mercure hub honors.
 */

import { api } from '$lib/api/client';
import type { Awareness } from 'y-protocols/awareness';
import { encodeAwarenessUpdate, applyAwarenessUpdate } from 'y-protocols/awareness';
import type { Peer, RemoteUpdateHandler, StatusHandler, SyncProvider, SyncProviderOptions, PeersHandler, SyncStatus } from './SyncProvider';

interface PullResponse {
	updates: string[];
	offset: number;
	size: number;
	peers: Peer[];
	room: string;
}

interface TokenResponse {
	hub: string;
	topic_doc: string;
	topic_aw: string;
	jwt: string;
	expires_in: number;
	room: string;
}

interface HubEnvelope {
	channel: 'doc' | 'aw';
	bytes: string; // base64
	serverTimeMs?: number;
}

function b64ToBytes(b64: string): Uint8Array {
	const bin = atob(b64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

function bytesToB64(bytes: Uint8Array): string {
	let bin = '';
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[]);
	}
	return btoa(bin);
}

/** Presence cadence — the periodic heartbeat that refreshes the "who's
 *  here" peer list and re-sends our full awareness state as a fallback.
 *  Local cursor moves no longer wait for this: see AWARENESS_DEBOUNCE_MS. */
const PRESENCE_INTERVAL_MS = 10_000;

/** Debounce window for pushing local awareness (cursor/selection) changes
 *  as soon as they happen, instead of waiting for the next presence
 *  heartbeat. Short enough to feel live, long enough to coalesce the
 *  burst of updates a single keystroke/selection drag can produce. */
const AWARENESS_DEBOUNCE_MS = 50;

export class MercureProvider implements SyncProvider {
	readonly roomId: string;

	private route: string;
	private lang: string | null;
	private clientId: string;
	private user: string | null;

	private offset = 0;
	private peers: Peer[] = [];
	private awareness: Awareness | null = null;
	private awarenessMeta: Record<string, unknown> | null = null;
	// Awareness updates that arrive on the SSE `aw` stream BEFORE the page
	// editor has called setAwareness() get parked here and drained on the
	// first setAwareness call. Without buffering, the early peer-state
	// updates are silently dropped — y-codemirror.next then has no
	// `state.user.color/name` for the peer until that peer's next cursor
	// move, leaving cursors invisible to a freshly-loaded tab.
	private pendingAwUpdates: Uint8Array[] = [];

	private docSource: EventSource | null = null;
	private awSource: EventSource | null = null;
	private presenceTimer: ReturnType<typeof setTimeout> | null = null;
	private tokenRefreshTimer: ReturnType<typeof setTimeout> | null = null;
	private refreshingToken = false;
	private disposed = false;

	// Fires an immediate (debounced) presence push whenever our own local
	// awareness state changes (cursor/selection), rather than waiting up to
	// PRESENCE_INTERVAL_MS for the next heartbeat. Kept so it can be
	// detached from the Awareness instance on disconnect/reassignment.
	private awarenessUpdateHandler: ((changes: { added: number[]; updated: number[]; removed: number[] }) => void) | null = null;
	private awarenessDebounceTimer: ReturnType<typeof setTimeout> | null = null;

	private remoteUpdateHandlers = new Set<RemoteUpdateHandler>();
	private peerHandlers = new Set<PeersHandler>();
	private statusHandlers = new Set<StatusHandler>();
	private status: SyncStatus = 'idle';
	private editorType: string | null;
	private unloadHandler: (() => void) | null = null;

	constructor(opts: SyncProviderOptions) {
		this.roomId = opts.roomId;
		this.route = opts.route;
		this.lang = opts.lang ?? null;
		this.clientId = opts.clientId;
		this.user = opts.user ?? null;
		this.editorType = opts.editorType ?? null;
	}

	async connect(): Promise<void> {
		if (this.disposed) return;
		this.setStatus('connecting');
		this.installUnloadHandler();
		try {
			// Initial HTTP pull catches us up on anything we missed before
			// the EventSource opens. Same shape as PollingProvider.pullOnce.
			await this.pullOnce();

			// Get the subscriber JWT and topic URLs.
			const token = await api.post<TokenResponse>('/sync/mercure/token', {
				route: this.route,
				lang: this.lang,
			});

			this.openStream(token, 'doc');
			this.openStream(token, 'aw');
			this.scheduleTokenRefresh(token.expires_in);

			// Send first awareness/presence heartbeat right away so
			// other peers see us promptly.
			await this.heartbeatOnce();
			this.schedulePresence();
			this.setStatus('connected');
		} catch (e) {
			this.setStatus('error', (e as Error).message);
			// No automatic retry loop here — page editor can call connect()
			// again; the lifecycle is managed at that layer.
		}
	}

	async disconnect(): Promise<void> {
		this.disposed = true;
		this.docSource?.close();
		this.awSource?.close();
		this.docSource = this.awSource = null;
		if (this.presenceTimer) clearTimeout(this.presenceTimer);
		this.presenceTimer = null;
		if (this.tokenRefreshTimer) clearTimeout(this.tokenRefreshTimer);
		this.tokenRefreshTimer = null;
		this.detachAwarenessListener();
		this.uninstallUnloadHandler();
		try {
			await api.post(this.presencePath(), { clientId: this.clientId, leave: true, lang: this.lang });
		} catch { /* ignore */ }
		this.setStatus('idle');
	}

	/** See PollingProvider.installUnloadHandler — same shape. */
	private installUnloadHandler(): void {
		if (typeof window === 'undefined' || this.unloadHandler) return;
		const handler = () => {
			if (this.disposed) return;
			api.beaconPost(this.presencePath(), {
				clientId: this.clientId,
				leave: true,
				lang: this.lang,
			});
		};
		this.unloadHandler = handler;
		window.addEventListener('pagehide', handler);
		window.addEventListener('beforeunload', handler);
	}

	private uninstallUnloadHandler(): void {
		if (typeof window === 'undefined' || !this.unloadHandler) return;
		window.removeEventListener('pagehide', this.unloadHandler);
		window.removeEventListener('beforeunload', this.unloadHandler);
		this.unloadHandler = null;
	}

	async push(update: Uint8Array): Promise<void> {
		if (this.disposed) return;
		try {
			await api.post(this.pushPath(), {
				clientId: this.clientId,
				update: bytesToB64(update),
				lang: this.lang,
			});
		} catch (e) {
			this.setStatus('error', (e as Error).message);
		}
	}

	updateAwareness(meta: Record<string, unknown> | null): void {
		this.awarenessMeta = meta;
	}

	setAwareness(awareness: Awareness): void {
		this.detachAwarenessListener();
		this.awareness = awareness;
		// Drain anything that arrived on the `aw` stream before now.
		if (this.pendingAwUpdates.length) {
			for (const bytes of this.pendingAwUpdates) {
				try { applyAwarenessUpdate(awareness, bytes, 'mercure'); } catch { /* skip malformed */ }
			}
			this.pendingAwUpdates = [];
		}
		// Push our own cursor/selection changes as soon as they happen
		// instead of waiting for the next presence heartbeat
		this.awarenessUpdateHandler = (changes) => {
			const touched = [...changes.added, ...changes.updated, ...changes.removed];
			if (!touched.includes(awareness.clientID)) return;
			// No point racing a cursor update out when nobody else is in the
			// room to see it — the next periodic heartbeat still carries our
			// latest state once a peer does join.
			if (!this.hasOtherPeers()) return;
			this.scheduleAwarenessPush();
		};
		awareness.on('update', this.awarenessUpdateHandler);
	}

	private hasOtherPeers(): boolean {
		return this.peers.some((p) => p.clientId !== this.clientId);
	}

	private detachAwarenessListener(): void {
		if (this.awareness && this.awarenessUpdateHandler) {
			this.awareness.off('update', this.awarenessUpdateHandler);
		}
		this.awarenessUpdateHandler = null;
		if (this.awarenessDebounceTimer) {
			clearTimeout(this.awarenessDebounceTimer);
			this.awarenessDebounceTimer = null;
		}
	}

	/** Coalesces a burst of local awareness changes into one send, fired
	 *  AWARENESS_DEBOUNCE_MS after the last change instead of on every
	 *  keystroke/mouse-move that touches the cursor. */
	private scheduleAwarenessPush(): void {
		if (this.disposed || this.awarenessDebounceTimer) return;
		this.awarenessDebounceTimer = setTimeout(() => {
			this.awarenessDebounceTimer = null;
			void this.flushAwarenessNow();
		}, AWARENESS_DEBOUNCE_MS);
	}

	private async flushAwarenessNow(): Promise<void> {
		if (this.disposed) return;
		try {
			await this.heartbeatOnce();
		} catch (e) {
			this.setStatus('error', (e as Error).message);
		}
		// Re-arm the periodic heartbeat from now so it doesn't fire again
		// moments after this out-of-band send.
		this.schedulePresence();
	}

	onRemoteUpdate(handler: RemoteUpdateHandler): void {
		this.remoteUpdateHandlers.add(handler);
	}
	onPeers(handler: PeersHandler): void {
		this.peerHandlers.add(handler);
	}
	onStatus(handler: StatusHandler): void {
		this.statusHandlers.add(handler);
		handler(this.status);
	}

	// --------------------------------------------------------------

	private pullPath(): string { return `/sync/pages${this.route}/pull`; }
	private pushPath(): string { return `/sync/pages${this.route}/push`; }
	private presencePath(): string { return `/sync/pages${this.route}/presence`; }

	private async pullOnce(): Promise<void> {
		const { updates, offset, peers } = await api.post<PullResponse>(this.pullPath(), {
			since: this.offset,
			clientId: this.clientId,
			lang: this.lang,
		});
		this.offset = offset;
		if (updates.length > 0) {
			for (const b64 of updates) {
				const bytes = b64ToBytes(b64);
				for (const h of this.remoteUpdateHandlers) h(bytes);
			}
		}
		this.consumePeerAwareness(peers);
		this.emitPeers(peers);
	}

	/**
	 * Apply each peer's last-known awareness state from their PresenceStore
	 * meta. Mirrors PollingProvider — Mercure used to rely solely on the
	 * live `aw` SSE stream, but freshly-joined peers don't get a state
	 * snapshot from peers who haven't moved their cursor since join.
	 * Buffers when awareness isn't wired yet (drained in setAwareness).
	 */
	private consumePeerAwareness(peers: Peer[]): void {
		for (const peer of peers) {
			if (peer.clientId === this.clientId) continue;
			const updateB64 = (peer.meta as Record<string, unknown> | undefined)?.awarenessUpdate;
			if (typeof updateB64 !== 'string' || updateB64.length === 0) continue;
			const bytes = b64ToBytes(updateB64);
			if (this.awareness) {
				try { applyAwarenessUpdate(this.awareness, bytes, 'mercure'); } catch { /* skip */ }
			} else {
				this.pendingAwUpdates.push(bytes);
			}
		}
	}

	private async heartbeatOnce(): Promise<void> {
		const meta: Record<string, unknown> = { ...(this.awarenessMeta ?? {}) };
		if (this.editorType) {
			meta.editorType = this.editorType;
		}
		if (this.awareness) {
			try {
				const u = encodeAwarenessUpdate(this.awareness, [this.awareness.clientID]);
				meta.awarenessUpdate = bytesToB64(u);
				meta.awarenessClientId = this.awareness.clientID;
			} catch { /* skip */ }
		}
		const { peers } = await api.post<{ peers: Peer[] }>(this.presencePath(), {
			clientId: this.clientId,
			user: this.user,
			meta,
			lang: this.lang,
		});
		this.consumePeerAwareness(peers);
		this.emitPeers(peers);
	}

	private schedulePresence(): void {
		if (this.disposed) return;
		if (this.presenceTimer) clearTimeout(this.presenceTimer);
		this.presenceTimer = setTimeout(() => this.presenceLoop(), PRESENCE_INTERVAL_MS);
	}

	private async presenceLoop(): Promise<void> {
		if (this.disposed) return;
		try { await this.heartbeatOnce(); }
		catch (e) { this.setStatus('error', (e as Error).message); }
		this.schedulePresence();
	}

	private openStream(token: TokenResponse, channel: 'doc' | 'aw'): void {
		const topic = channel === 'doc' ? token.topic_doc : token.topic_aw;
		const url = new URL(token.hub);
		url.searchParams.append('topic', topic);
		// Mercure accepts the JWT via query string; lacking custom-header
		// support in EventSource leaves us little choice.
		url.searchParams.set('authorization', token.jwt);

		const es = new EventSource(url.toString());
		es.onmessage = (ev) => {
			let env: HubEnvelope;
			try { env = JSON.parse(ev.data); } catch { return; }
			if (typeof env.bytes !== 'string' || env.bytes === '') return;
			const bytes = b64ToBytes(env.bytes);
			if (env.channel === 'doc') {
				for (const h of this.remoteUpdateHandlers) h(bytes);
			} else if (env.channel === 'aw') {
				if (this.awareness) {
					try {
						applyAwarenessUpdate(this.awareness, bytes, 'mercure');
					} catch { /* skip malformed */ }
				} else {
					// Buffer until setAwareness() lands, then drain.
					this.pendingAwUpdates.push(bytes);
				}
			}
		};
		es.onerror = () => {
			if (this.disposed) return;
			this.setStatus('connecting', 'mercure stream reconnecting');
			// Browsers auto-reconnect EventSources after transient network
			// failures (readyState stays CONNECTING). For hard failures —
			// notably a 401 once the JWT in the URL has expired — Chrome
			// closes the source (CLOSED). Re-mint the token and reopen.
			if (es.readyState === EventSource.CLOSED) {
				void this.refreshToken();
			}
		};
		es.onopen = () => {
			if (!this.disposed) this.setStatus('connected');
		};

		if (channel === 'doc') this.docSource = es;
		else this.awSource = es;
	}

	private emitPeers(peers: Peer[]): void {
		this.peers = peers;
		for (const h of this.peerHandlers) h(peers);
	}

	/**
	 * Re-fetch the subscriber JWT and reopen both SSE streams. Called
	 * proactively before `expires_in` elapses, and reactively when an
	 * EventSource closes hard (Chrome closes on 401). Coalesces concurrent
	 * callers via `refreshingToken`.
	 */
	private async refreshToken(): Promise<void> {
		if (this.disposed || this.refreshingToken) return;
		this.refreshingToken = true;
		try {
			const token = await api.post<TokenResponse>('/sync/mercure/token', {
				route: this.route,
				lang: this.lang,
			});
			if (this.disposed) return;
			this.docSource?.close();
			this.awSource?.close();
			this.docSource = this.awSource = null;
			this.openStream(token, 'doc');
			this.openStream(token, 'aw');
			this.scheduleTokenRefresh(token.expires_in);
		} catch (e) {
			if (!this.disposed) this.setStatus('error', (e as Error).message);
		} finally {
			this.refreshingToken = false;
		}
	}

	private scheduleTokenRefresh(expiresInSeconds: number | undefined): void {
		if (this.tokenRefreshTimer) clearTimeout(this.tokenRefreshTimer);
		this.tokenRefreshTimer = null;
		if (this.disposed) return;
		// Refresh at 80% of TTL, clamped to a sane window. Server returns
		// expires_in in seconds; we work in ms here.
		const ttl = typeof expiresInSeconds === 'number' && expiresInSeconds > 0
			? expiresInSeconds * 1000
			: 600_000;
		const lead = Math.max(30_000, Math.min(ttl * 0.8, ttl - 30_000));
		this.tokenRefreshTimer = setTimeout(() => { void this.refreshToken(); }, lead);
	}

	private setStatus(status: SyncStatus, detail?: string): void {
		if (this.status === status) return;
		this.status = status;
		for (const h of this.statusHandlers) h(status, detail);
	}
}
