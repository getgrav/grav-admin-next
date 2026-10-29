// Regression test for grav-admin-next#43: Editor Pro showed stale content after
// the page was edited in Expert mode with collaboration on, because Expert mode
// writes only Y.Text and the Y.XmlFragment Editor Pro binds to was never reset.
//
// Run: node --test tests/editorBinding.stale-fragment.test.ts
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { createEditorBinding } from '../src/lib/sync/bindings/editorBinding.ts';

// Awareness runs a timer; dispose every binding so the runner can exit.
const disposers: Array<() => void> = [];
after(() => disposers.forEach((d) => d()));

function setup(doc = new Y.Doc()) {
	const text = doc.getMap('form').get('content') as Y.Text | undefined ?? (() => {
		const t = new Y.Text();
		doc.getMap('form').set('content', t);
		return t;
	})();
	const b = createEditorBinding({ doc, clientId: 'c1', userName: 'Test', contentText: text });
	disposers.push(b.dispose);
	return { doc, text, collab: b.collab };
}

// What Editor Pro does: on mount it seeds the fragment from markdown only when
// the fragment is empty, and every edit echoes its serialized markdown back.
function editorProMount(collab: ReturnType<typeof setup>['collab'], markdown: string) {
	(collab as any).prepareFragment?.();
	if (collab.fragment.length === 0) {
		const p = new Y.XmlElement('paragraph');
		p.insert(0, [new Y.XmlText(markdown)]);
		collab.fragment.insert(0, [p]);
	}
}
function editorProType(collab: ReturnType<typeof setup>['collab'], text: Y.Text, markdown: string) {
	const p = collab.fragment.get(0) as Y.XmlElement;
	(p.get(0) as Y.XmlText).delete(0, (p.get(0) as Y.XmlText).length);
	(p.get(0) as Y.XmlText).insert(0, markdown);
	(collab as any).markFragmentSynced?.(markdown);
	text.delete(0, text.length);
	text.insert(0, markdown);
}
const fragText = (f: Y.XmlFragment) => (f.length ? ((f.get(0) as Y.XmlElement).get(0) as Y.XmlText).toString() : '');

test('Expert-mode edit to Y.Text resets the fragment before Editor Pro remounts', () => {
	const { text, collab } = setup();
	text.insert(0, 'one');
	editorProMount(collab, text.toString());
	editorProType(collab, text, 'one two');

	// Expert mode: CodeMirror (yCollab) writes Y.Text only.
	text.insert(text.length, ' three');

	editorProMount(collab, text.toString());
	assert.equal(fragText(collab.fragment), 'one two three');
});

test('stale fragment persisted in the room is reset on a fresh client (full reload)', () => {
	const a = setup();
	a.text.insert(0, 'one');
	editorProMount(a.collab, a.text.toString());
	editorProType(a.collab, a.text, 'one two');
	a.text.insert(a.text.length, ' three'); // Expert edit, then the tab is closed

	// New tab: replays the persisted room log into a fresh doc.
	const doc2 = new Y.Doc();
	Y.applyUpdate(doc2, Y.encodeStateAsUpdate(a.doc));
	const b = setup(doc2);
	editorProMount(b.collab, b.text.toString());
	assert.equal(fragText(b.collab.fragment), 'one two three');
});

test('an in-sync fragment is left alone on remount', () => {
	const { text, collab } = setup();
	text.insert(0, 'one');
	editorProMount(collab, text.toString());
	editorProType(collab, text, 'one two');
	const before = collab.fragment.get(0);
	editorProMount(collab, text.toString());
	assert.equal(collab.fragment.get(0), before, 'fragment must not be rebuilt when Y.Text has not moved on');
});
