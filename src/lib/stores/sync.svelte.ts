/**
 * Global sync state. One slot per active room is overkill for now —
 * in practice only one page is being edited at a time per tab. We keep
 * the map so multi-tab scenarios or future side-panel editing can plug
 * in additional rooms without reshaping this store.
 */

import type { Peer, SyncStatus } from '$lib/sync/SyncProvider';

interface RoomState {
	status: SyncStatus;
	peers: Peer[];
	detail?: string;
	lastUpdateAt: number;
}

function emptyRoom(): RoomState {
	return { status: 'idle', peers: [], lastUpdateAt: 0 };
}

function createSyncStore() {
	const rooms = $state<Record<string, RoomState>>({});

	return {
		/** Read-only view of the room map. */
		get rooms(): Record<string, RoomState> {
			return rooms;
		},

		/** Get (or lazily create) the state slot for a room. */
		room(roomId: string): RoomState {
			return rooms[roomId] ?? (rooms[roomId] = emptyRoom());
		},

		setStatus(roomId: string, status: SyncStatus, detail?: string): void {
			const r = rooms[roomId] ?? (rooms[roomId] = emptyRoom());
			r.status = status;
			r.detail = detail;
		},

		setPeers(roomId: string, peers: Peer[]): void {
			const r = rooms[roomId] ?? (rooms[roomId] = emptyRoom());
			r.peers = peers;
			r.lastUpdateAt = Date.now();
		},

		clearRoom(roomId: string): void {
			delete rooms[roomId];
		},
	};
}

export const syncStore = createSyncStore();
