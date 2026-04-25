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

/** Presence cadence (slower than the polling provider's because the
 *  awareness updates flow live via Mercure between heartbeats). */
const PRESENCE_INTERVAL_MS = 10_000;

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

	private docSource: EventSource | null = null;
	private awSource: EventSource | null = null;
	private presenceTimer: ReturnType<typeof setTimeout> | null = null;
	private disposed = false;

	private remoteUpdateHandlers = new Set<RemoteUpdateHandler>();
	private peerHandlers = new Set<PeersHandler>();
	private statusHandlers = new Set<StatusHandler>();
	private status: SyncStatus = 'idle';

	constructor(opts: SyncProviderOptions) {
		this.roomId = opts.roomId;
		this.route = opts.route;
		this.lang = opts.lang ?? null;
		this.clientId = opts.clientId;
		this.user = opts.user ?? null;
	}

	async connect(): Promise<void> {
		if (this.disposed) return;
		this.setStatus('connecting');
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
		try {
			await api.post(this.presencePath(), { clientId: this.clientId, leave: true, lang: this.lang });
		} catch { /* ignore */ }
		this.setStatus('idle');
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
		this.awareness = awareness;
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
		this.emitPeers(peers);
	}

	private async heartbeatOnce(): Promise<void> {
		const meta: Record<string, unknown> = { ...(this.awarenessMeta ?? {}) };
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
			} else if (env.channel === 'aw' && this.awareness) {
				try {
					applyAwarenessUpdate(this.awareness, bytes, 'mercure');
				} catch { /* skip malformed */ }
			}
		};
		es.onerror = () => {
			// Browsers auto-reconnect EventSources after transient failures;
			// status reflects the disconnect briefly.
			if (this.disposed) return;
			this.setStatus('connecting', 'mercure stream reconnecting');
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

	private setStatus(status: SyncStatus, detail?: string): void {
		if (this.status === status) return;
		this.status = status;
		for (const h of this.statusHandlers) h(status, detail);
	}
}
