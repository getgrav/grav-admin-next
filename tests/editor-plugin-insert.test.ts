import { test } from 'node:test';
import assert from 'node:assert/strict';
import { insertTarget, selectionAfterInsert } from '../src/lib/utils/editor-plugin-insert.ts';

const doc = 'Hello world, see the contact page.';
const slice = (d: string) => (from: number, to: number) => d.slice(from, to);

test('the modal result replaces the selection captured at click time', () => {
	const r = insertTarget({ from: 21, to: 28, text: 'contact' }, { from: 0, to: 0 }, doc.length, slice(doc));
	assert.deepEqual(r, { from: 21, to: 28 });
});

test('a plain cursor (empty selection) is kept too', () => {
	const r = insertTarget({ from: 5, to: 5, text: '' }, { from: 0, to: 0 }, doc.length, slice(doc));
	assert.deepEqual(r, { from: 5, to: 5 });
});

test('if the text under the captured range changed, the current selection is used', () => {
	const edited = 'Hi world, see the contact page.';
	const r = insertTarget({ from: 21, to: 28, text: 'contact' }, { from: 3, to: 3 }, edited.length, slice(edited));
	assert.deepEqual(r, { from: 3, to: 3 });
});

test('a captured range past the end of a shortened document falls back', () => {
	const short = 'Hello';
	const r = insertTarget({ from: 21, to: 28, text: 'contact' }, { from: 5, to: 5 }, short.length, slice(short));
	assert.deepEqual(r, { from: 5, to: 5 });
});

test('without select the cursor goes after the inserted text', () => {
	assert.deepEqual(selectionAfterInsert({ insertContent: '[x](/a)' }, 10, 7), { anchor: 17, head: 17 });
});

test('select picks a range inside the inserted text', () => {
	// "[link text](/contact)" with "link text" selected
	assert.deepEqual(selectionAfterInsert({ select: { from: 1, to: 10 } }, 4, 21), { anchor: 5, head: 14 });
});

test('select with only from places a cursor', () => {
	assert.deepEqual(selectionAfterInsert({ select: { from: 3 } }, 0, 10), { anchor: 3, head: 3 });
});

test('select offsets are clamped to the inserted text', () => {
	assert.deepEqual(selectionAfterInsert({ select: { from: -4, to: 99 } }, 2, 5), { anchor: 2, head: 7 });
	assert.deepEqual(
		selectionAfterInsert({ select: { from: 'x' as unknown as number } }, 2, 5),
		{ anchor: 7, head: 7 }
	);
});
