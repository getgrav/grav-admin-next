/**
 * Lightweight presence/awareness store.
 *
 * Not the full y-protocols/awareness binary protocol — for HTTP polling
 * we carry awareness as plain JSON objects via the presence endpoint.
 * Shape matches the server's PresenceStore peer list.
 *
 * The full y-protocols/awareness API can be swapped in later (Phase 5/6)
 * for transports that benefit from binary encoding. The rest of the app
 * only depends on the `peers` reactive surface and `setLocal()`.
 */

import type { Peer } from './SyncProvider';

export class Awareness {
	#peers: Peer[] = [];
	#localMeta: Record<string, unknown> = {};
	#listeners = new Set<(peers: Peer[]) => void>();

	constructor(readonly clientId: string) {}

	get peers(): Peer[] {
		return this.#peers;
	}

	/** Peers excluding this client. */
	get others(): Peer[] {
		return this.#peers.filter((p) => p.clientId !== this.clientId);
	}

	get localMeta(): Record<string, unknown> {
		return this.#localMeta;
	}

	setLocal(meta: Record<string, unknown>): void {
		this.#localMeta = meta;
	}

	/** Called by the provider when server hands back a fresh peer list. */
	updateFromProvider(peers: Peer[]): void {
		this.#peers = peers;
		for (const l of this.#listeners) l(peers);
	}

	on(handler: (peers: Peer[]) => void): () => void {
		this.#listeners.add(handler);
		return () => this.#listeners.delete(handler);
	}
}
