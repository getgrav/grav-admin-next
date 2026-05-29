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
	eventName?: string | null;
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
	let timer: ReturnType<typeof setTimeout> | null = null;
	// `since` starts at the current server time on the first response so we
	// don't re-fire historical saves the page has already loaded into its
	// baseline. Until then we ask the server with `since=now` heuristic by
	// using 0 only on the very first pull (channel might not exist yet).
	let since: number | null = null;
	let bootstrapped = false;

	async function tick() {
		if (cancelled) return;
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
					if (msg.eventName === 'page-saved' && msg.payload?.kind === 'page-saved') {
						opts.onSaved(msg.payload as unknown as PageSavedEvent);
					}
				}
			}
		} catch {
			// Channel might not be registered yet (no save has ever happened
			// for this room), or auth failed, or transport blip — silently
			// retry next tick. We don't surface anything to the editor.
		}
		if (!cancelled) timer = setTimeout(tick, intervalMs);
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
