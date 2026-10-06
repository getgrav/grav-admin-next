import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listItemTitle } from '../src/lib/utils/list-item-title.ts';

test('a row is titled by the first field in blueprint order, not by the order its data was stored', () => {
	// A new row stores the defaulted `icon` first, then `label` once it is typed.
	const data = { icon: 'star', label: 'Home', url: '/' };
	assert.equal(listItemTitle(data, ['label', 'icon', 'url']), 'Home');
});

test('fields with nothing in them are skipped, in blueprint order', () => {
	assert.equal(listItemTitle({ icon: 'star', label: '', url: '/x' }, ['label', 'url', 'icon']), '/x');
	assert.equal(listItemTitle({ label: null, url: 3 }, ['label', 'url']), '');
});

test('data that matches no blueprint field still gives a title, from the first text stored', () => {
	assert.equal(listItemTitle({ count: 2, old: 'legacy', other: 'x' }, ['label']), 'legacy');
	assert.equal(listItemTitle({ value: 'bare.jpg' }, []), 'bare.jpg');
});

test('a row with no text has no title', () => {
	assert.equal(listItemTitle({}, ['label']), '');
	assert.equal(listItemTitle({ flag: true }, ['flag']), '');
});
