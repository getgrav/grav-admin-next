/**
 * Invalidation event types emitted by the API client after mutations, focus,
 * or manual calls. Subscribers use these types plus glob patterns to listen.
 *
 * Format: `<resource>:<action>` or `<resource>:<action>:<id>`.
 * Glob subscriptions (`pages:*`, `pages:update:*`) match any segment suffix.
 */

/** Resources that can be invalidated. */
export type InvalidationResource =
	| 'pages'
	| 'users'
	| 'config'
	| 'plugins'
	| 'themes'
	| 'media'
	| 'gpm'
	| 'webhook';

/** High-level invalidation action (resource-scoped). */
export type InvalidationAction =
	| 'create'
	| 'update'
	| 'delete'
	| 'list'
	| 'move'
	| 'copy';

/**
 * A single invalidation event. The `tag` is the canonical string form
 * (`pages:update:/blog/post-1`); `resource`, `action`, and `id` are parsed
 * convenience fields.
 */
export interface InvalidationEvent {
	tag: string;
	resource: string;
	action: string;
	id?: string;
}

/** Subscriber callback — called once per matched event. */
export type InvalidationHandler = (event: InvalidationEvent) => void;

/** Returned by subscribe() — call to unsubscribe. */
export type Unsubscribe = () => void;

/** Optional dirty-state guard — subscriber is skipped if it returns true. */
export type DirtyGuard = () => boolean;

/** 409 conflict event, emitted alongside ApiRequestError so UI can react. */
export interface ConflictEvent {
	path: string;
	method: string;
	message: string;
}
