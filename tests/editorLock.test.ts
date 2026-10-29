// The collab editor lock keys on the editor in use, not the preference
// (follow-up to grav-admin-next#43). Two users who both prefer Editor Pro, one
// in Normal mode and one in Expert mode, used to share the content unlocked:
// the Editor Pro side never saw the Expert side's typing and overwrote it.
//
// Run: node --test tests/editorLock.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeEditorType, contentFieldType, nextEditorSince, resolveEditorLock, type LockPeer } from '../src/lib/sync/editorLock.ts';

const isCustom = (t: string) => t === 'editor-pro';

const peer = (clientId: string, user: string, joinedAt: number, editorType: string, editorSince?: number): LockPeer => ({
	clientId, user, joinedAt, meta: editorSince === undefined ? { editorType } : { editorType, editorSince },
});

test('Expert mode counts as the code editor whatever the preference', () => {
	assert.equal(activeEditorType('expert', 'editor-pro', 'editor-pro', isCustom), 'codemirror');
	assert.equal(activeEditorType('normal', 'editor-pro', 'markdown', isCustom), 'editor-pro');
	assert.equal(activeEditorType('normal', '', 'markdown', isCustom), 'codemirror');
	assert.equal(activeEditorType('normal', 'editor-pro', null, isCustom), 'codemirror', 'no blueprint renders the plain markdown editor');
});

test('Normal mode uses the editor the content field actually renders', () => {
	// editor-pro rewrites `markdown` to `editor-pro` in the blueprint, also for
	// users with no preference when it's the site default.
	assert.equal(activeEditorType('normal', '', 'editor-pro', isCustom), 'editor-pro');
	const blueprint = [{ name: 'tabs', type: 'tabs', fields: [{ name: 'content', type: 'tab', fields: [{ name: 'header.title', type: 'text' }, { name: 'content', type: 'editor-pro' }] }] }];
	assert.equal(contentFieldType(blueprint), 'editor-pro');
});

test('switching to Expert while a peer is in Editor Pro locks the switcher, at once', () => {
	// A joined first, B second; both prefer Editor Pro.
	const peers = [peer('a', 'Alice', 100, 'editor-pro'), peer('b', 'Bob', 105, 'editor-pro')];
	assert.equal(resolveEditorLock(peers, { clientId: 'b', editorType: 'editor-pro' }), null);

	// B switches to Expert. The server list still has B's old meta (no heartbeat yet).
	const since = nextEditorSince(peers, { clientId: 'b', editorType: 'editor-pro' });
	const bLock = resolveEditorLock(peers, { clientId: 'b', editorType: activeEditorType('expert', 'editor-pro', 'editor-pro', isCustom), editorSince: since });
	assert.deepEqual(bLock, { ownerType: 'editor-pro', ownerName: 'Alice' });

	// Once B's heartbeat lands, A stays unlocked.
	const after = [peer('a', 'Alice', 100, 'editor-pro'), peer('b', 'Bob', 105, 'codemirror', since)];
	assert.equal(resolveEditorLock(after, { clientId: 'a', editorType: 'editor-pro' }), null);

	// Switching back releases B.
	const back = nextEditorSince(after, { clientId: 'b', editorType: 'codemirror', editorSince: since });
	assert.equal(resolveEditorLock(after, { clientId: 'b', editorType: 'editor-pro', editorSince: back }), null);
});

test('the first joiner switching mode is the one locked, not the peer already editing', () => {
	const peers = [peer('a', 'Alice', 100, 'editor-pro'), peer('b', 'Bob', 105, 'editor-pro')];
	const since = nextEditorSince(peers, { clientId: 'a', editorType: 'editor-pro' });
	assert.deepEqual(
		resolveEditorLock(peers, { clientId: 'a', editorType: 'codemirror', editorSince: since }),
		{ ownerType: 'editor-pro', ownerName: 'Bob' },
	);
	const after = [peer('a', 'Alice', 100, 'codemirror', since), peer('b', 'Bob', 105, 'editor-pro')];
	assert.equal(resolveEditorLock(after, { clientId: 'b', editorType: 'editor-pro' }), null);
});

test('Expert mode co-edits with a peer on the plain CodeMirror field', () => {
	const peers = [peer('a', 'Alice', 100, 'codemirror'), peer('b', 'Bob', 105, 'editor-pro')];
	// B (Editor Pro in Normal mode) is locked by A's CodeMirror...
	assert.ok(resolveEditorLock(peers, { clientId: 'b', editorType: 'editor-pro' }));
	// ...and Expert mode, also CodeMirror on Y.Text, is not.
	const since = nextEditorSince(peers, { clientId: 'b', editorType: 'editor-pro' });
	assert.equal(resolveEditorLock(peers, { clientId: 'b', editorType: 'codemirror', editorSince: since }), null);
});

test('without a mid-session switch the first joiner still wins', () => {
	const peers = [peer('a', 'Alice', 100, 'codemirror'), peer('b', 'Bob', 105, 'editor-pro')];
	assert.equal(resolveEditorLock(peers, { clientId: 'a', editorType: 'codemirror' }), null);
	assert.deepEqual(resolveEditorLock(peers, { clientId: 'b', editorType: 'editor-pro' }), { ownerType: 'codemirror', ownerName: 'Alice' });
});
