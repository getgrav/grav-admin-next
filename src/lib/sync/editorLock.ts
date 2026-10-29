/**
 * Editor-type lock for the collaborative content field.
 *
 * Editor Pro binds to a Y.XmlFragment, while Expert mode and the built-in
 * CodeMirror field bind to the Y.Text that gets saved. The two can't co-edit:
 * the Editor Pro side never sees the other side's typing, and its next change
 * writes its own copy back over it. So only one kind of editor may write the
 * content at a time, and everyone else gets the read-only view.
 *
 * The lock keys on the editor actually in use, not the user's preference:
 * Expert mode always counts as the code editor (it mounts CodeMirror on Y.Text
 * whatever the preference says). A peer advertises that type in its presence
 * meta (`editorType`) and re-advertises it when the user switches mode.
 *
 * Who wins: the peer that has been using its current editor the longest. A
 * peer's position is its `editorSince` (sent when it switched editor during the
 * session) or else its server `joinedAt`. A switch takes `editorSince` as one
 * past the latest position this client knows, so the user who switches into a
 * conflict is the one who gets the read-only view, and they see it at once
 * because the lock is computed from their own local state, with no wait for a
 * heartbeat. Locking the peer instead would leave them typing into an editor
 * that overwrites the switcher until the next heartbeat reached them.
 * Both values are in the server's clock domain (`joinedAt` is server time and
 * `editorSince` is derived from it), so client clock skew doesn't matter.
 */

export const CODE_EDITOR = 'codemirror';

export interface LockPeer {
	clientId: string;
	user?: string | null;
	meta?: Record<string, unknown>;
	joinedAt?: number;
}

export interface LocalEditor {
	clientId: string;
	/** The editor this client is using for the content right now. */
	editorType: string;
	/** Set once this client switched editor during the session. */
	editorSince?: number | null;
}

export interface EditorLock {
	ownerType: string;
	ownerName: string;
}

/**
 * The editor in use for the content field. Expert mode always uses the code
 * editor. In Normal mode it's what the blueprint's content field renders: a
 * registered custom field type (editor-pro rewrites `markdown` to `editor-pro`
 * in the blueprint for its users, including everyone when it's the site
 * default), else the preferred custom editor for a `markdown` field (resolved
 * the way FieldRenderer resolves it), else CodeMirror. No blueprint, or no
 * content field, renders the plain markdown editor.
 */
export function activeEditorType(
	mode: 'normal' | 'expert' | string,
	preferred: string,
	contentFieldType: string | null,
	isCustomField: (type: string) => boolean = () => false,
): string {
	if (mode === 'expert' || !contentFieldType) return CODE_EDITOR;
	if (contentFieldType !== 'markdown' && contentFieldType !== 'editor' && isCustomField(contentFieldType)) return contentFieldType;
	if (contentFieldType === 'markdown' && preferred && preferred !== CODE_EDITOR) return preferred;
	return CODE_EDITOR;
}

/** The type of the blueprint field named `content`, wherever it's nested. */
export function contentFieldType(fields: Array<{ name?: string; type?: string; fields?: unknown }> | undefined | null): string | null {
	for (const f of fields ?? []) {
		if (f.name === 'content' && f.type && f.type !== 'tab' && f.type !== 'section' && f.type !== 'fieldset' && !Array.isArray(f.fields)) return f.type;
		if (Array.isArray(f.fields)) {
			const t = contentFieldType(f.fields as Array<{ name?: string; type?: string; fields?: unknown }>);
			if (t) return t;
		}
	}
	return null;
}

function metaOf(p: LockPeer): Record<string, unknown> {
	return (p.meta ?? {}) as Record<string, unknown>;
}

/** A peer's place in the queue: when it started using its current editor. */
export function editorPosition(p: LockPeer): number {
	const since = metaOf(p).editorSince;
	if (typeof since === 'number' && Number.isFinite(since)) return since;
	return p.joinedAt ?? 0;
}

/** The `editorSince` to advertise when this client switches editor now. */
export function nextEditorSince(peers: LockPeer[], self: LocalEditor): number {
	let max = 0;
	for (const p of withSelf(peers, self)) max = Math.max(max, editorPosition(p));
	return max + 1;
}

/**
 * The peer list with this client's own entry carrying its local, current
 * editor state. The server's copy of it lags by a heartbeat; until our first
 * heartbeat lands it's missing altogether.
 */
function withSelf(peers: LockPeer[], self: LocalEditor): LockPeer[] {
	const own = peers.find((p) => p.clientId === self.clientId);
	const meta: Record<string, unknown> = { ...(own ? metaOf(own) : {}), editorType: self.editorType };
	if (typeof self.editorSince === 'number') meta.editorSince = self.editorSince;
	else delete meta.editorSince;
	const mine: LockPeer = { clientId: self.clientId, user: own?.user, joinedAt: own?.joinedAt ?? Number.MAX_SAFE_INTEGER, meta };
	return [...peers.filter((p) => p.clientId !== self.clientId), mine];
}

/**
 * The lock this client is under, or null when it may edit. The owner is the
 * peer with the earliest position that declares an editor type; we're locked
 * when the owner is someone else using a different editor.
 */
export function resolveEditorLock(peers: LockPeer[], self: LocalEditor): EditorLock | null {
	const sorted = withSelf(peers, self).sort((a, b) => {
		const pa = editorPosition(a);
		const pb = editorPosition(b);
		if (pa !== pb) return pa - pb;
		return a.clientId.localeCompare(b.clientId);
	});
	for (const p of sorted) {
		const t = metaOf(p).editorType;
		if (typeof t !== 'string' || t.length === 0) continue;
		if (p.clientId === self.clientId) return null; // we're the owner
		if (t === self.editorType) return null;        // the owner uses our editor
		return { ownerType: t, ownerName: (p.user as string) || 'another user' };
	}
	return null;
}
