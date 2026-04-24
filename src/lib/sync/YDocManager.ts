/**
 * Per-page Yjs document lifecycle.
 *
 * Responsibilities:
 *   - Owns the Y.Doc and the Y.Text shapes this app collaborates on
 *     (currently `content`; title/frontmatter can be added later).
 *   - Wires a SyncProvider for transport.
 *   - Tags local Y.Doc updates with `origin === 'local'` so the
 *     provider's remote-apply path can tell inbound from outbound.
 *   - Exposes an `Awareness` for presence/cursor data.
 *
 * Usage (Svelte):
 *   const mgr = new YDocManager({ roomId, route, clientId, user, provider })
 *   await mgr.connect()
 *   // bind mgr.content to Svelte state via `createContentBinding`
 *   // ...
 *   await mgr.dispose()
 */

import * as Y from 'yjs';
import { Awareness } from './awareness';
import type { SyncProvider } from './SyncProvider';

const ORIGIN_LOCAL = Symbol('ydoc:local');
export const ORIGIN_REMOTE = Symbol('ydoc:remote');

export interface YDocManagerOptions {
	roomId: string;
	clientId: string;
	user: string | null;
	provider: SyncProvider;
}

export class YDocManager {
	readonly doc: Y.Doc;
	readonly content: Y.Text;
	readonly awareness: Awareness;
	readonly roomId: string;

	private provider: SyncProvider;
	private disposed = false;
	private updateHandler: (update: Uint8Array, origin: unknown) => void;

	constructor(opts: YDocManagerOptions) {
		this.roomId = opts.roomId;
		this.doc = new Y.Doc();
		this.content = this.doc.getText('content');
		this.awareness = new Awareness(opts.clientId);
		this.provider = opts.provider;

		// Send local-origin updates to the transport. Remote updates land via
		// provider.onRemoteUpdate and are applied with ORIGIN_REMOTE so this
		// handler ignores them.
		this.updateHandler = (update: Uint8Array, origin: unknown) => {
			if (origin === ORIGIN_REMOTE || this.disposed) return;
			this.provider.push(update);
		};
		this.doc.on('update', this.updateHandler);

		this.provider.onRemoteUpdate((bytes) => {
			if (this.disposed) return;
			Y.applyUpdate(this.doc, bytes, ORIGIN_REMOTE);
		});

		this.provider.onPeers((peers) => {
			if (this.disposed) return;
			this.awareness.updateFromProvider(peers);
		});
	}

	async connect(): Promise<void> {
		await this.provider.connect();
	}

	async dispose(): Promise<void> {
		this.disposed = true;
		this.doc.off('update', this.updateHandler);
		try {
			await this.provider.disconnect();
		} finally {
			this.doc.destroy();
		}
	}

	/** Opaque origin tag used when mutating the doc locally from a binding. */
	get localOrigin(): symbol {
		return ORIGIN_LOCAL;
	}
}
