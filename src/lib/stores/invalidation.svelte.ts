/**
 * Invalidation event bus — typed pub/sub for cache invalidation.
 *
 * Events follow the tag format `resource:action[:id]` (e.g. `pages:update:/blog/post-1`).
 * Subscribers match exact tags or glob patterns:
 *   - `pages:*` matches `pages:update`, `pages:delete`, `pages:update:/blog/post-1`
 *   - `pages:update:*` matches any pages:update with any id
 *   - `*:focus` matches any focus-triggered event
 *
 * Events are emitted by:
 *   - API client (reading `X-Invalidates` response header)
 *   - Window focus handler (after >30s blur)
 *   - Manual calls from components
 */

import type {
	InvalidationEvent,
	InvalidationHandler,
	Unsubscribe,
	DirtyGuard,
} from '$lib/api/types';

interface Subscription {
	pattern: string;
	segments: string[];
	handler: InvalidationHandler;
	dirtyGuard?: DirtyGuard;
}

/** Parse a tag string into its structured form. */
function parseTag(tag: string): InvalidationEvent {
	const segments = tag.split(':');
	return {
		tag,
		resource: segments[0] ?? '',
		action: segments[1] ?? '',
		id: segments.length > 2 ? segments.slice(2).join(':') : undefined,
	};
}

/**
 * Match an event tag against a glob pattern.
 * Each `:` segment is compared independently; `*` matches any single segment.
 * A pattern may also omit trailing segments — they act as wildcards.
 */
function matches(eventSegments: string[], patternSegments: string[]): boolean {
	// Pattern with fewer segments matches any event with the same prefix.
	// e.g. 'pages:update' matches 'pages:update' AND 'pages:update:/blog/post'.
	if (patternSegments.length > eventSegments.length) return false;

	for (let i = 0; i < patternSegments.length; i++) {
		const p = patternSegments[i];
		const e = eventSegments[i];
		if (p === '*') continue;
		if (p !== e) return false;
	}
	return true;
}

function createInvalidationBus() {
	const subscriptions = new Set<Subscription>();

	return {
		/**
		 * Emit one or more invalidation events. Tags can be strings or already
		 * structured events. Subscribers with a dirtyGuard that returns true are
		 * skipped.
		 *
		 * Each handler runs at most once per emit, however many of the tags it
		 * matches: one save answers with `pages:update:/x, pages:list`, and a
		 * `pages:*` subscriber used to refetch twice. The handler gets the most
		 * specific event it matched, the first one carrying an id (for a move,
		 * that is `pages:move:<old route>`), or else the first it matched.
		 * Handlers are grouped by function identity, so one function subscribed
		 * to several patterns also runs once. Handlers run in subscription order.
		 */
		emit(tagOrEvent: string | InvalidationEvent | Array<string | InvalidationEvent>): void {
			const list = Array.isArray(tagOrEvent) ? tagOrEvent : [tagOrEvent];
			const events = list.map((item) => (typeof item === 'string' ? parseTag(item) : item));
			const matched = new Map<InvalidationHandler, { subs: Subscription[]; hits: InvalidationEvent[] }>();

			for (const sub of subscriptions) {
				for (const event of events) {
					if (!matches(event.tag.split(':'), sub.segments)) continue;
					if (sub.dirtyGuard?.()) break;
					let entry = matched.get(sub.handler);
					if (!entry) {
						entry = { subs: [], hits: [] };
						matched.set(sub.handler, entry);
					}
					if (!entry.subs.includes(sub)) entry.subs.push(sub);
					entry.hits.push(event);
				}
			}

			for (const [handler, { subs, hits }] of matched) {
				// An earlier handler may have unsubscribed this one (a view
				// unmounting mid-dispatch); skip it as iterating the live set did.
				if (!subs.some((sub) => subscriptions.has(sub))) continue;
				const event = hits.find((e) => e.id !== undefined) ?? hits[0];
				try {
					handler(event);
				} catch (err) {
					console.error('[invalidation] subscriber error for', event.tag, err);
				}
			}
		},

		/**
		 * Subscribe to events matching the given pattern.
		 * Returns an unsubscribe function — ALWAYS store and call it in cleanup
		 * (e.g. `onMount(() => unsubscribe)`) to avoid leaks.
		 */
		subscribe(
			pattern: string,
			handler: InvalidationHandler,
			options: { dirtyGuard?: DirtyGuard } = {},
		): Unsubscribe {
			const sub: Subscription = {
				pattern,
				segments: pattern.split(':'),
				handler,
				dirtyGuard: options.dirtyGuard,
			};
			subscriptions.add(sub);
			return () => {
				subscriptions.delete(sub);
			};
		},

		/**
		 * Convenience: subscribe to all events for a single resource.
		 * Equivalent to `subscribe('<resource>:*', handler)`.
		 */
		subscribeResource(
			resource: string,
			handler: InvalidationHandler,
			options: { dirtyGuard?: DirtyGuard } = {},
		): Unsubscribe {
			return this.subscribe(`${resource}:*`, handler, options);
		},

		/** Parse a tag — exposed for consumers that need to inspect events. */
		parseTag,

		/** Current subscription count — useful for tests/debugging. */
		get subscriberCount(): number {
			return subscriptions.size;
		},
	};
}

export const invalidations = createInvalidationBus();
