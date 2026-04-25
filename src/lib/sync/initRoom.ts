/**
 * Server-arbitrated initial seeding for empty collab rooms.
 *
 * Resolves the empty-room race: when two clients open a fresh page at the
 * same time both observe an empty Y.Doc locally and would each `seed()`
 * their own copy of the initial blueprint state. Because the seeds are
 * sent as separate Yjs updates with different clientIDs, Y.Map.set ops
 * land twice and Y.Text inserts at offset 0 stack — `"HelloHello"`-style.
 *
 * Server arbitrates the race under an exclusive flock: only one caller's
 * seed actually lands in the log. Losers get the canonical state inline
 * in the response so they don't have to wait for the next pull tick.
 *
 * Usage: build the seed in a *temporary* Y.Doc (so the live doc isn't
 * mutated until we know we won), encode the state, then call this. The
 * helper applies the resulting bytes to the live doc with `remoteOrigin`,
 * which YDocManager's update handler ignores — so the seed isn't echoed
 * back to the wire (the server already has it on the win path; the loser
 * is just absorbing peer state).
 */

import * as Y from 'yjs';
import { api } from '$lib/api/client';

interface InitResponse {
	seeded: boolean;
	offset: number;
	size: number;
	updates?: string[];
	room: string;
}

function bytesToB64(bytes: Uint8Array): string {
	let bin = '';
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[]);
	}
	return btoa(bin);
}

function b64ToBytes(b64: string): Uint8Array {
	const bin = atob(b64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

export interface TryInitRoomOptions {
	doc: Y.Doc;
	route: string;
	lang: string | null;
	clientId: string;
	seedBytes: Uint8Array;
	remoteOrigin: symbol;
}

/**
 * Attempt to seed an empty room. Returns whether THIS caller's seed was
 * the one that landed. In both branches the live `doc` is updated to
 * the canonical state.
 */
export async function tryInitRoom(opts: TryInitRoomOptions): Promise<boolean> {
	const resp = await api.post<InitResponse>(`/sync/pages${opts.route}/init`, {
		seed: bytesToB64(opts.seedBytes),
		clientId: opts.clientId,
		lang: opts.lang ?? undefined,
	});

	if (resp.seeded) {
		Y.applyUpdate(opts.doc, opts.seedBytes, opts.remoteOrigin);
		return true;
	}

	for (const b64 of resp.updates ?? []) {
		Y.applyUpdate(opts.doc, b64ToBytes(b64), opts.remoteOrigin);
	}
	return false;
}
