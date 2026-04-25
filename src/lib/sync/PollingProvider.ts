/**
 * HTTP polling SyncProvider. Default transport — works on every Grav host
 * (including shared PHP-FPM) since it's just short-lived POSTs to the API.
 *
 * Behavior:
 *   - Pulls on an adaptive cadence: idleIntervalMs when alone in the room,
 *     activeIntervalMs when at least one other peer is present. This is the
 *     same heuristic WordPress 7.0's RTC uses.
 *   - Pushes are fire-and-forget (await for error handling, but we don't
 *     block other pushes waiting for the round trip). If a push fails, the
 *     update stays in the local Y.Doc and will naturally resync via pull.
 *   - Awareness is piggy-backed on the presence endpoint on a separate,
 *     slower cadence (every 5s idle, every 2s active) since it's chatty.
 */

import { api } from '$lib/api/client';
import type { Awareness } from 'y-protocols/awareness';
import { encodeAwarenessUpdate, applyAwarenessUpdate } from 'y-protocols/awareness';
import type { Peer, RemoteUpdateHandler, StatusHandler, SyncProvider, SyncProviderOptions, PeersHandler, SyncStatus } from './SyncProvider';

// The admin2 API client already unwraps the outer `{ data: … }` envelope
// (see client.ts:169), so these types describe the inner shape directly.
type PullResponse = {
	updates: string[];
	offset: number;
	size: number;
	peers: Peer[];
	room: string;
	serverTimeMs: number;
};

type PushResponse = { ok: boolean; offset: number; bytes: number };

type PresenceResponse = { peers: Peer[] };

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

export class PollingProvider implements SyncProvider {
	readonly roomId: string;

	private route: string;
	private lang: string | null;
	private clientId: string;
	private user: string | null;

	private idleMs: number;
	private activeMs: number;
	private presenceIdleMs: number;
	private presenceActiveMs: number;

	private pullTimer: ReturnType<typeof setTimeout> | null = null;
	private presenceTimer: ReturnType<typeof setTimeout> | null = null;
	private disposed = false;

	private offset = 0;
	private peers: Peer[] = [];
	private awarenessMeta: Record<string, unknown> | null = null;
	/**
	 * Optional Awareness instance (y-protocols/awareness). When set, every
	 * heartbeat carries a base64-encoded delta of our local awareness state
	 * in the presence meta, and we decode peers' deltas on the way back to
	 * keep our local Awareness map populated with their cursor / selection
	 * info. y-prosemirror's yCursorPlugin and y-codemirror's cursor layer
	 * read from this Awareness to render remote carets.
	 */
	private awareness: Awareness | null = null;

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
		this.idleMs = opts.idleIntervalMs ?? 4000;
		this.activeMs = opts.activeIntervalMs ?? 1000;
		// Awareness can afford to be slower than doc pulls.
		this.presenceIdleMs = Math.max(5000, this.idleMs);
		this.presenceActiveMs = Math.max(2000, this.activeMs * 2);
	}

	async connect(): Promise<void> {
		if (this.disposed) return;
		this.setStatus('connecting');
		this.installUnloadHandler();
		try {
			await this.pullOnce();
			await this.heartbeatOnce();
			this.setStatus('connected');
			this.schedulePull();
			this.schedulePresence();
		} catch (e) {
			this.setStatus('error', (e as Error).message);
			// Retry after a delay — pull loop will keep trying.
			this.schedulePull();
		}
	}

	async disconnect(): Promise<void> {
		this.disposed = true;
		if (this.pullTimer) clearTimeout(this.pullTimer);
		if (this.presenceTimer) clearTimeout(this.presenceTimer);
		this.pullTimer = this.presenceTimer = null;
		this.uninstallUnloadHandler();
		// Best-effort leave; ignore errors.
		try {
			await api.post(this.presencePath(), { clientId: this.clientId, leave: true, lang: this.lang });
		} catch {
			/* ignore */
		}
		this.setStatus('idle');
	}

	/**
	 * Fire a leave on `pagehide` so the editor-type lock (and presence
	 * generally) releases immediately when the user closes the tab,
	 * navigates away externally, or hits Cmd-W. Without this we'd be
	 * relying purely on the server-side TTL to expire the entry, which
	 * leaves a "ghost" peer hogging the editor lock for up to 30s.
	 *
	 * The leave goes via `keepalive`-fetch (see ApiClient.beaconPost)
	 * because regular fetches get cancelled during page unload.
	 */
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
		// `pagehide` is the most reliable across modern browsers (covers
		// bfcache, mobile suspend, tab close). `beforeunload` is a
		// secondary catch for older Firefox / corner cases.
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
			await api.post<PushResponse>(this.pushPath(), {
				clientId: this.clientId,
				update: bytesToB64(update),
				lang: this.lang,
			});
			// Opportunistic: pull right after push to pick up anything else that
			// might have landed in the meantime and to keep offset aligned.
			this.pullSoon();
		} catch (e) {
			this.setStatus('error', (e as Error).message);
			// Let the pull loop drive recovery — don't throw.
		}
	}

	updateAwareness(meta: Record<string, unknown> | null): void {
		this.awarenessMeta = meta;
		// Don't spam presence on every cursor move; heartbeat cadence handles it.
	}

	/**
	 * Attach a y-protocols Awareness so heartbeats carry its encoded state
	 * to peers and incoming peer awareness updates flow back into it.
	 * Call once after creating the provider — it can be set after `connect()`
	 * since editor bindings are typically wired post-seed.
	 */
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
		// Deliver current status immediately so late subscribers aren't stuck.
		handler(this.status);
	}

	// --------------------------------------------------------------

	private pullPath(): string {
		return `/sync/pages${this.route}/pull`;
	}
	private pushPath(): string {
		return `/sync/pages${this.route}/push`;
	}
	private presencePath(): string {
		return `/sync/pages${this.route}/presence`;
	}

	private get pullIntervalMs(): number {
		return this.hasOtherPeers() ? this.activeMs : this.idleMs;
	}

	private get presenceIntervalMs(): number {
		return this.hasOtherPeers() ? this.presenceActiveMs : this.presenceIdleMs;
	}

	private hasOtherPeers(): boolean {
		return this.peers.some((p) => p.clientId !== this.clientId);
	}

	private schedulePull(): void {
		if (this.disposed) return;
		if (this.pullTimer) clearTimeout(this.pullTimer);
		this.pullTimer = setTimeout(() => this.pullLoop(), this.pullIntervalMs);
	}

	private pullSoon(): void {
		if (this.disposed) return;
		if (this.pullTimer) clearTimeout(this.pullTimer);
		this.pullTimer = setTimeout(() => this.pullLoop(), 0);
	}

	private schedulePresence(): void {
		if (this.disposed) return;
		if (this.presenceTimer) clearTimeout(this.presenceTimer);
		this.presenceTimer = setTimeout(() => this.heartbeatLoop(), this.presenceIntervalMs);
	}

	private async pullLoop(): Promise<void> {
		if (this.disposed) return;
		try {
			await this.pullOnce();
			this.setStatus('connected');
		} catch (e) {
			this.setStatus('error', (e as Error).message);
		}
		this.schedulePull();
	}

	private async heartbeatLoop(): Promise<void> {
		if (this.disposed) return;
		try {
			await this.heartbeatOnce();
		} catch (e) {
			// Non-fatal; presence just won't refresh this tick.
			this.setStatus('error', (e as Error).message);
		}
		this.schedulePresence();
	}

	private async pullOnce(): Promise<void> {
		const { updates, offset, peers } = await api.post<PullResponse>(this.pullPath(), {
			since: this.offset,
			clientId: this.clientId,
			lang: this.lang,
		});
		this.offset = offset;
		this.emitPeers(peers);
		if (updates.length > 0) {
			for (const b64 of updates) {
				const bytes = b64ToBytes(b64);
				for (const h of this.remoteUpdateHandlers) h(bytes);
			}
		}
	}

	private async heartbeatOnce(): Promise<void> {
		// Build outbound meta. If a y-protocols Awareness is attached,
		// piggyback its encoded delta so peers can render our cursor.
		const meta: Record<string, unknown> = { ...(this.awarenessMeta ?? {}) };
		if (this.editorType) {
			meta.editorType = this.editorType;
		}
		if (this.awareness) {
			try {
				const update = encodeAwarenessUpdate(this.awareness, [this.awareness.clientID]);
				meta.awarenessUpdate = bytesToB64(update);
				meta.awarenessClientId = this.awareness.clientID;
			} catch {
				/* don't let awareness encoding kill the heartbeat */
			}
		}

		const { peers } = await api.post<PresenceResponse>(this.presencePath(), {
			clientId: this.clientId,
			user: this.user,
			meta,
			lang: this.lang,
		});

		// Apply remote awareness deltas before emitting peers so any
		// downstream listener that consults Awareness reads the latest.
		if (this.awareness) {
			for (const peer of peers) {
				if (peer.clientId === this.clientId) continue;
				const updateB64 = (peer.meta as Record<string, unknown> | undefined)?.awarenessUpdate;
				if (typeof updateB64 !== 'string' || updateB64.length === 0) continue;
				try {
					applyAwarenessUpdate(this.awareness, b64ToBytes(updateB64), peer.clientId);
				} catch {
					/* skip malformed updates */
				}
			}
		}

		this.emitPeers(peers);
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
