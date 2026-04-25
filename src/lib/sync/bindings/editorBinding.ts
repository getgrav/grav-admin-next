/**
 * Editor-level Yjs binding (Phase 6).
 *
 * Creates a Y.XmlFragment for rich-editor collaborative state living
 * alongside FormBinding's Y.Map on the same Y.Doc, and exposes the
 * admin2 Yjs module on `window.__GRAV_YJS__` so editor-pro's bundle
 * (which also imports yjs) can reuse the exact same instance. That
 * matters because y-prosemirror's internals rely on `instanceof`
 * checks against Y.XmlFragment — two copies of yjs produce two
 * unrelated classes and the plugin wouldn't recognize our fragment.
 *
 * The fragment is separate from the Y.Text('content') FormBinding
 * maintains; they don't auto-cross-sync. Live CRDT merging and live
 * cursors only work when all peers are using editor-pro — a mixed
 * editor-pro + CodeMirror session falls back to the Y.Text-based
 * coarse sync. Fine for MVP; a full bidirectional bridge is scope
 * for a later phase.
 */

import * as Y from 'yjs';
import * as YAwarenessModule from 'y-protocols/awareness';
import { Awareness } from 'y-protocols/awareness';

// Expose admin2's Yjs + y-protocols/awareness modules on `window` at module
// load time so editor-pro's bundle (which has its `yjs` and `y-protocols`
// imports redirected to these globals via an esbuild plugin) reuses the
// exact same class identities. y-prosemirror does `instanceof Y.XmlFragment`
// internally and would reject a fragment created by a different Y copy.
if (typeof window !== 'undefined') {
	const w = window as unknown as { __GRAV_YJS__?: { yjs: typeof Y; awareness: typeof YAwarenessModule; Y: typeof Y; Awareness: typeof Awareness } };
	if (!w.__GRAV_YJS__) {
		w.__GRAV_YJS__ = { yjs: Y, awareness: YAwarenessModule, Y, Awareness };
	}
}

export interface EditorCollab {
	/** Y.XmlFragment for ProseMirror-based editors (editor-pro). */
	fragment: Y.XmlFragment;
	/**
	 * Y.Text for CodeMirror-based editors. Shared with FormBinding's
	 * `content` slot — both sides bind to the same instance so a CM and
	 * an editor-pro user editing simultaneously stay in sync at the
	 * markdown-string level (though character-level CRDT only works
	 * when both peers use the same editor type).
	 */
	yText: Y.Text;
	awareness: Awareness;
	user: { name: string; color: string };
}

/**
 * No-op kept for back-compat with existing callers. The actual exposure
 * happens at module load time above so it's guaranteed to run before any
 * downstream consumer imports.
 */
export function exposeSharedYjs(): void {}

/**
 * Stable per-client color derived from the clientId so peers keep their
 * cursor color across reconnects. Keep in sync with PresenceAvatars for
 * a consistent visual identity.
 */
export function clientColor(clientId: string): string {
	let h = 0;
	for (let i = 0; i < clientId.length; i++) h = (h * 31 + clientId.charCodeAt(i)) | 0;
	return `hsl(${((h % 360) + 360) % 360} 65% 45%)`;
}

export interface CreateEditorBindingOptions {
	doc: Y.Doc;
	clientId: string;
	userName: string;
	/**
	 * The Y.Text the FormBinding is using for the content field. Sharing
	 * a single instance avoids drift between FormBinding's snapshot path
	 * and CodeMirror's yCollab plugin.
	 */
	contentText: Y.Text;
	/** Root name for the editor fragment inside the shared doc. */
	fragmentKey?: string;
}

export interface EditorBinding {
	collab: EditorCollab;
	dispose(): void;
}

/**
 * Create the editor-level collab artifacts attached to the given Y.Doc.
 */
export function createEditorBinding(opts: CreateEditorBindingOptions): EditorBinding {
	exposeSharedYjs();
	const { doc, clientId, userName, contentText, fragmentKey = 'content:xml' } = opts;
	const fragment = doc.getXmlFragment(fragmentKey);
	const awareness = new Awareness(doc);
	awareness.setLocalStateField('user', { name: userName, color: clientColor(clientId) });

	return {
		collab: {
			fragment,
			yText: contentText,
			awareness,
			user: { name: userName, color: clientColor(clientId) },
		},
		dispose() {
			awareness.destroy();
		},
	};
}
