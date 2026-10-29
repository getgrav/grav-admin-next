// A collab room adopts edits made to the page file outside the admin when the
// room has no unsaved edits, and keeps (and reports) its unsaved edits when it
// does (follow-up to grav-admin-next#43). Before, an existing room always won:
// the editors showed its older text and the next save deleted the file edit.
//
// Run: node --test tests/savedState.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { contentHash, decideContent, markSaved, mergeHeader, reconcileWithDisk, recordSave, type DiskState } from '../src/lib/sync/savedState.ts';
import { toYValue } from '../src/lib/sync/bindings/formBinding.ts';

const isText = (p: string) => p === 'content';

/** A room as the editor seeds it: `form` holds content + header, `saved` the marker. */
function room(disk: DiskState): Y.Doc {
	const doc = new Y.Doc();
	doc.transact(() => {
		const form = doc.getMap('form');
		form.set('content', toYValue(disk.content, 'content', isText));
		form.set('header', toYValue(disk.header, 'header', isText));
	});
	markSaved(doc, disk);
	return doc;
}
const text = (doc: Y.Doc) => (doc.getMap('form').get('content') as Y.Text).toString();
const header = (doc: Y.Doc) => (doc.getMap('form').get('header') as Y.Map<unknown>).toJSON();
const type = (doc: Y.Doc, s: string) => { const t = doc.getMap('form').get('content') as Y.Text; t.insert(t.length, s); };

const saved: DiskState = { content: 'Hello', header: { title: 'Page', tags: ['a'] } };

test('decideContent: clean room adopts the file, dirty room keeps its edits', () => {
	const h = contentHash('Hello');
	assert.equal(decideContent('Hello', 'Hello', h), 'same');
	assert.equal(decideContent('Hello', 'Hello disk', h), 'adopt');
	assert.equal(decideContent('Hello typed', 'Hello', h), 'keep');
	assert.equal(decideContent('Hello typed', 'Hello disk', h), 'conflict');
	assert.equal(decideContent('Hello typed', 'Hello', undefined), 'conflict', 'a room without a marker cannot tell which side moved');
	// Editor Pro drops the file's trailing newline when it mounts: not an edit.
	assert.equal(decideContent('Hello', 'Hello\n\nMore on disk\n', contentHash('Hello\n')), 'adopt');
	assert.equal(decideContent('Hello', 'Hello\n', contentHash('Hello\n')), 'same');
});

test('mergeHeader: per key, the file wins where the room has no unsaved edit', () => {
	const m = mergeHeader(
		{ title: 'Page', tags: ['a'], summary: 'typed' },
		{ title: 'Disk title', tags: ['a'] },
		{ title: 'Page', tags: ['a'] },
	);
	assert.deepEqual(m.adopt, { title: 'Disk title' });
	assert.deepEqual(m.conflicts, []);
	const c = mergeHeader({ title: 'Typed' }, { title: 'Disk' }, { title: 'Page' });
	assert.deepEqual(c.conflicts, ['title']);
	assert.deepEqual(c.nextSaved, { title: 'Page' }, 'an unresolved conflict keeps the old marker so the warning repeats');
	assert.deepEqual(mergeHeader({ title: 'x', a: 1 }, { title: 'y' }, undefined).conflicts, []);
});

test('clean room: a disk edit is adopted, content and header', () => {
	const doc = room(saved);
	const disk = { content: 'Hello\n\nAppended on disk', header: { title: 'Disk title', tags: ['a', 'b'] } };
	const r = reconcileWithDisk(doc, disk, isText);
	assert.equal(r.content, 'adopt');
	assert.equal(text(doc), disk.content);
	assert.deepEqual(header(doc), disk.header);
	// Next open: nothing to do and nothing written.
	assert.equal(reconcileWithDisk(doc, disk, isText).changed, false);
});

test('dirty room + disk edit: the unsaved edits are kept and reported', () => {
	const doc = room(saved);
	type(doc, ' typed');
	const r = reconcileWithDisk(doc, { content: 'Hello from disk', header: saved.header }, isText);
	assert.equal(r.content, 'conflict');
	assert.equal(text(doc), 'Hello typed');
	// Still reported on the next open, until a save settles it.
	assert.equal(reconcileWithDisk(doc, { content: 'Hello from disk', header: saved.header }, isText).content, 'conflict');
});

test('dirty room, unchanged file: kept, no warning', () => {
	const doc = room(saved);
	type(doc, ' typed');
	assert.equal(reconcileWithDisk(doc, saved, isText).content, 'keep');
	assert.equal(text(doc), 'Hello typed');
});

test('after a save the marker follows, so a later disk edit is adopted', () => {
	const doc = room(saved);
	type(doc, ' typed');
	markSaved(doc, { content: 'Hello typed', header: saved.header });
	reconcileWithDisk(doc, { content: 'Hello typed, then disk', header: saved.header }, isText);
	assert.equal(text(doc), 'Hello typed, then disk');
});

test('frontmatter saved from Expert mode (never in the room) is carried into it on save', () => {
	const doc = room(saved);
	// Expert mode saved a new title and dropped `tags`; the room still has the old header.
	const disk = { content: 'Hello', header: { title: 'Expert title' } };
	recordSave(doc, disk, isText);
	assert.deepEqual(header(doc), { title: 'Expert title' });
	assert.equal(reconcileWithDisk(doc, disk, isText).changed, false);
});

test('two editors adopting the same disk edit at once do not double it', () => {
	const a = room(saved);
	const b = new Y.Doc();
	Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
	const disk = { content: 'Hello\n\nAppended on disk', header: { title: 'Disk title', tags: ['a'] } };

	const updates: Uint8Array[] = [];
	a.on('update', (u: Uint8Array, origin: unknown) => { if (origin === 'local') updates.push(u); });
	b.on('update', (u: Uint8Array, origin: unknown) => { if (origin === 'local') updates.push(u); });
	reconcileWithDisk(a, disk, isText, 'local');
	reconcileWithDisk(b, disk, isText, 'local');
	assert.equal(updates.length, 2);
	Y.applyUpdate(a, updates[1]);
	Y.applyUpdate(b, updates[0]);
	assert.equal(text(a), disk.content);
	assert.equal(text(b), disk.content);
	assert.deepEqual(header(a), disk.header);
});
