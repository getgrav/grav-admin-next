/**
 * Transport-agnostic interface every sync provider implements.
 *
 * A provider moves opaque Yjs update bytes between the local Y.Doc and the
 * server (and, via the server, other peers). It also moves awareness blobs
 * for presence/cursor tracking.
 *
 * Providers never touch the Yjs doc directly — the YDocManager subscribes
 * to `doc.on('update', …)` for outbound and calls `Y.applyUpdate(doc, …)`
 * on inbound. This keeps the CRDT layer independent of transport choice.
 */

export type SyncStatus = 'idle' | 'connecting' | 'connected' | 'offline' | 'error';

export interface Peer {
	clientId: string;
	user?: string | null;
	meta?: Record<string, unknown>;
	age?: number;
	/** Unix epoch seconds when the peer first heartbeat into the room.
	 *  Preserved across the peer's heartbeats — used to identify the
	 *  canonical first-joiner (e.g. for editor-type lock arbitration). */
	joinedAt?: number;
}

/**
 * Emitted whenever the provider wants to hand new remote updates to the
 * document. `origin` is always 'remote' so the Y.Doc update handler knows
 * not to echo them back onto the wire.
 */
export type RemoteUpdateHandler = (update: Uint8Array) => void;
export type PeersHandler = (peers: Peer[]) => void;
export type StatusHandler = (status: SyncStatus, detail?: string) => void;

export interface SyncProviderOptions {
	/** Absolute room id (e.g. "blog/hello@default" or with lang). */
	roomId: string;
	/** Page route, without leading slash stripping — sent to server as-is. */
	route: string;
	/** Language code if a translation is being edited. */
	lang?: string | null;
	/** Client-assigned id; included in pushes and awareness. */
	clientId: string;
	/** Display name to advertise in presence. */
	user?: string | null;
	/** Editor type this client is using for the content field
	 *  (e.g. 'editor-pro' or 'codemirror'). Sent in presence meta so
	 *  peers can detect mixed-editor sessions and lock to the
	 *  first-joiner's choice. */
	editorType?: string | null;
	/** Initial cadence hints from capabilities. Provider may override. */
	idleIntervalMs?: number;
	activeIntervalMs?: number;
}

export interface SyncProvider {
	readonly roomId: string;

	connect(): Promise<void>;
	disconnect(): Promise<void>;

	/** Push a locally-produced Yjs update. */
	push(update: Uint8Array): Promise<void>;

	/** Set or clear this client's awareness payload (cursor, selection, etc.). */
	updateAwareness(meta: Record<string, unknown> | null): void;

	/**
	 * Attach a y-protocols Awareness instance so the provider can encode
	 * its local state on outbound traffic and apply peers' deltas as
	 * they arrive. Optional — providers may implement this as a no-op
	 * when they don't need a separate awareness channel.
	 */
	setAwareness?(awareness: import('y-protocols/awareness').Awareness): void;

	onRemoteUpdate(handler: RemoteUpdateHandler): void;
	onPeers(handler: PeersHandler): void;
	onStatus(handler: StatusHandler): void;
}
