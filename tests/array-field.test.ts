import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arrayFieldRows } from '../src/lib/utils/array-field.ts';

test('a key/value field shows a YAML list with its indexes as keys (admin2#218)', () => {
	assert.deepEqual(arrayFieldRows(['Coffee machine', 'Dishwasher'], false), [
		{ key: '0', value: 'Coffee machine' },
		{ key: '1', value: 'Dishwasher' }
	]);
});

test('a key/value field shows a map as before', () => {
	assert.deepEqual(arrayFieldRows({ 0: 'Fridge', 4: 'Oven', espresso: 'yes' }, false), [
		{ key: '0', value: 'Fridge' },
		{ key: '4', value: 'Oven' },
		{ key: 'espresso', value: 'yes' }
	]);
});

test('a value_only field shows a list as before and a map by its values', () => {
	assert.deepEqual(arrayFieldRows(['a', 'b'], true), [
		{ key: '', value: 'a' },
		{ key: '', value: 'b' }
	]);
	assert.deepEqual(arrayFieldRows({ 0: 'Fridge', 4: 'Oven', 5: 'Toaster' }, true), [
		{ key: '', value: 'Fridge' },
		{ key: '', value: 'Oven' },
		{ key: '', value: 'Toaster' }
	]);
});

test('no value, a scalar or an empty list give no rows', () => {
	for (const v of [null, undefined, '', 'text', 3, [], {}]) {
		assert.deepEqual(arrayFieldRows(v, false), []);
		assert.deepEqual(arrayFieldRows(v, true), []);
	}
});

test('null entries read as empty strings and numbers as their text', () => {
	assert.deepEqual(arrayFieldRows([null, 2], false), [
		{ key: '0', value: '' },
		{ key: '1', value: '2' }
	]);
});
