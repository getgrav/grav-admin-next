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
import type { Peer, RemoteUpdateHandler, StatusHandler, SyncProvider, SyncProviderOptions, PeersHandler, SyncStatus } from './SyncProvider';

type PullResponse = {
	data: {
		updates: string[];
		offset: number;
		size: number;
		peers: Peer[];
		room: string;
		serverTimeMs: number;
	};
};

type PushResponse = {
	data: { ok: boolean; offset: number; bytes: number };
};

type PresenceResponse = {
	data: { peers: Peer[] };
};

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
	private awareness: Record<string, unknown> | null = null;

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
		this.idleMs = opts.idleIntervalMs ?? 4000;
		this.activeMs = opts.activeIntervalMs ?? 1000;
		// Awareness can afford to be slower than doc pulls.
		this.presenceIdleMs = Math.max(5000, this.idleMs);
		this.presenceActiveMs = Math.max(2000, this.activeMs * 2);
	}

	async connect(): Promise<void> {
		if (this.disposed) return;
		this.setStatus('connecting');
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
		// Best-effort leave; ignore errors.
		try {
			await api.post(this.presencePath(), { clientId: this.clientId, leave: true, lang: this.lang });
		} catch {
			/* ignore */
		}
		this.setStatus('idle');
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
		this.awareness = meta;
		// Don't spam presence on every cursor move; heartbeat cadence handles it.
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
		const res = await api.post<PullResponse>(this.pullPath(), {
			since: this.offset,
			clientId: this.clientId,
			lang: this.lang,
		});
		const { updates, offset, peers } = res.data;
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
		const res = await api.post<PresenceResponse>(this.presencePath(), {
			clientId: this.clientId,
			user: this.user,
			meta: this.awareness ?? {},
			lang: this.lang,
		});
		this.emitPeers(res.data.peers);
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
