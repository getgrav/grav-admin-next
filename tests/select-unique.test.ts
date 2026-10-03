import { test } from 'node:test';
import assert from 'node:assert/strict';
import { takenByOtherRows, uniqueListOptions, withoutTaken } from '../src/lib/utils/select-unique.ts';

const opts = [
	{ value: 'a', label: 'Alpha' },
	{ value: 'b', label: 'Beta' },
	{ value: 'c', label: 'Gamma' }
];

test('a row cannot pick what another row already holds', () => {
	assert.deepEqual(withoutTaken(opts, ['a', 'c'], ''), [{ value: 'b', label: 'Beta' }]);
	assert.deepEqual(withoutTaken(opts, [], ''), opts);
});

test('a row keeps its own value even when a stored repeat means another row has it too', () => {
	assert.deepEqual(withoutTaken(opts, ['a'], 'a').map((o) => o.value), ['a', 'b', 'c']);
	assert.deepEqual(withoutTaken(opts, [1], '1').map((o) => o.value), ['a', 'b', 'c']);
});

test('the taken values come from every row but the one being edited, skipping blanks', () => {
	const rows = [{ file: 'a' }, { file: 'b' }, { file: '' }, {}, { file: null }, { file: 'c', other: 'a' }];
	assert.deepEqual(takenByOtherRows(rows, 'file', 1), ['a', 'c']);
	assert.deepEqual(takenByOtherRows(rows, 'file', 0), ['b', 'c']);
	assert.deepEqual(takenByOtherRows([], 'file', 0), []);
});

test('the list-level selectunique set reads as an array of values, a value-to-label map or option objects', () => {
	assert.deepEqual(uniqueListOptions(['x.pdf', 'y.zip']), [
		{ value: 'x.pdf', label: 'x.pdf' },
		{ value: 'y.zip', label: 'y.zip' }
	]);
	assert.deepEqual(uniqueListOptions({ 'Y-m-d': 'Y-m-d (2026-10-03)' }), [
		{ value: 'Y-m-d', label: 'Y-m-d (2026-10-03)' }
	]);
	assert.deepEqual(uniqueListOptions([{ value: 1, label: 'One' }, { label: 'no value' }, { value: 'k' }]), [
		{ value: '1', label: 'One' },
		{ value: 'k', label: 'k' }
	]);
	// What the API sends when the provider had nothing to offer.
	assert.deepEqual(uniqueListOptions([]), []);
	assert.deepEqual(uniqueListOptions(undefined), []);
	assert.deepEqual(uniqueListOptions('nope'), []);
});
