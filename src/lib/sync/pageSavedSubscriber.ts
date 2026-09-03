/**
 * Subscribes to the per-room `sync:page-saved:<roomId>` broadcast channel
 * that the grav-plugin-sync side publishes after every successful page save
 * (via its `onApiPageUpdated` listener). Editors use this to advance their
 * local baseline so the unsaved-changes guard doesn't trip on edits a peer
 * already saved.
 *
 * The transport is a small dedicated poller on `GET /sync/channels/pull` —
 * polling is fine because saves are rare relative to CRDT typing traffic,
 * and decoupling from the main SyncProvider keeps the change surface tight.
 * A future revision can route this through Mercure when the active sync
 * transport supports broadcasts.
 *
 * Auth on the server side is `api.pages.read` against the underlying page;
 * if the channel hasn't been registered yet (no save has fired in this
 * process), the pull will 404 and we silently retry — first save will
 * register the channel and subsequent polls will work.
 */

import { api } from '$lib/api/client';
import { isSyncUnavailable } from './availability';

export interface PageSavedEvent {
	roomId: string;
	route: string;
	template: string;
	language: string | null;
	savedAt: number;
	savedBy: { username: string; fullname: string } | null;
}

export interface PageSavedSubscriber {
	dispose(): void;
}

interface ChannelMessage {
	timestamp: number;
	payload: Record<string, unknown>;
	/** Wire key is `event` - see BroadcastMessage::toArray() and
	 *  FileBroadcastStorage::since() in grav-plugin-sync. */
	event?: string | null;
}

interface ChannelPullResponse {
	channel: string;
	messageType: string;
	messages: ChannelMessage[];
	serverTimeMs: number;
}

export function subscribePageSaved(opts: {
	roomId: string;
	intervalMs?: number;
	onSaved: (event: PageSavedEvent) => void;
}): PageSavedSubscriber {
	const channelId = `sync:page-saved:${opts.roomId}`;
	const intervalMs = opts.intervalMs ?? 4000;

	let cancelled = false;
	// Consecutive failures back the poll off instead of hammering a fixed interval.
	// A 429 or a 403 otherwise kept the loop at full rate for the whole edit
	// session, on top of whatever caused it. (grav-plugin-sync#3)
	let failures = 0;
	let timer: ReturnType<typeof setTimeout> | null = null;
	// `since` starts at the current server time on the first response so we
	// don't re-fire historical saves the page has already loaded into its
	// baseline. Until then we ask the server with `since=now` heuristic by
	// using 0 only on the very first pull (channel might not exist yet).
	let since: number | null = null;
	let bootstrapped = false;

	async function tick() {
		if (cancelled) return;
		// Another sync caller (the CRDT provider / init) learned the API has no
		// /sync routes — stop polling the channel endpoint too. A 404 here alone
		// is ambiguous (the channel isn't registered until the first save), so we
		// defer to that shared latch rather than guessing. (admin2#73)
		if (isSyncUnavailable()) { cancelled = true; return; }
		try {
			const params: Record<string, string> = { id: channelId };
			if (since !== null) params.since = String(since);
			const res = await api.get<ChannelPullResponse>('/sync/channels/pull', params);

			if (!bootstrapped) {
				// First successful pull — anchor `since` at server time and
				// drop any historical messages. We only care about saves that
				// happen AFTER this editor opened.
				since = res.serverTimeMs ?? 0;
				bootstrapped = true;
			} else {
				since = res.serverTimeMs ?? since;
				for (const msg of res.messages ?? []) {
					if (msg.event === 'page-saved' && msg.payload?.kind === 'page-saved') {
						opts.onSaved(msg.payload as unknown as PageSavedEvent);
					}
				}
			}
			failures = 0;
		} catch {
			// Channel might not be registered yet (no save has ever happened
			// for this room), or auth failed, or transport blip — silently
			// retry next tick. We don't surface anything to the editor.
			failures = Math.min(failures + 1, 5);
		}
		// 4s, 8s, 16s, 32s, 64s, capped at ~2min.
		if (!cancelled) timer = setTimeout(tick, intervalMs * 2 ** failures);
	}

	// Kick off the first poll immediately so the bootstrap `since` anchors
	// promptly; subsequent polls space out at intervalMs.
	timer = setTimeout(tick, 0);

	return {
		dispose: () => {
			cancelled = true;
			if (timer) {
				clearTimeout(timer);
				timer = null;
			}
		},
	};
}
