import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	dateInputType,
	isEmptyFormValue,
	isIsoDate,
	isNumericText,
	numberInputType,
	toFormValue,
	toStoredValue
} from '../src/lib/utils/media-metadata.ts';

// The metadata form used to keep every field as a string, so a stored number or
// boolean fell into the text input's `typeof … === 'string'` guard and rendered
// as an empty box. The edit buffer now mirrors the field's type.

test('a stored number becomes text in the edit buffer, a boolean stays a boolean', () => {
	assert.equal(toFormValue({ key: 'rating', label: 'Rating', type: 'number', value: 5 }), '5');
	assert.equal(toFormValue({ key: 'rating', label: 'Rating', type: 'number', value: 4.5 }), '4.5');
	assert.equal(
		toFormValue({ key: 'featured', label: 'Featured', type: 'boolean', value: true }),
		true
	);
	assert.equal(
		toFormValue({ key: 'featured', label: 'Featured', type: 'boolean', value: false }),
		false
	);
	assert.equal(
		toFormValue({ key: 'taken', label: 'Taken', type: 'date', value: '2026-10-19' }),
		'2026-10-19'
	);
	assert.equal(toFormValue({ key: 'alt', label: 'Alt', type: 'text', value: 'Beach' }), 'Beach');
});

test('a hand-written boolean value stays visible instead of reading as unchecked', () => {
	assert.equal(
		toFormValue({ key: 'featured', label: 'Featured', type: 'boolean', value: 'yes' }),
		'yes'
	);
	// The API reads a null/empty stored value as false.
	assert.equal(
		toFormValue({ key: 'featured', label: 'Featured', type: 'boolean', value: '' }),
		false
	);
});

test('a hand-edited list under a scalar field stays visible instead of blanking', () => {
	// The API returns a value that does not fit the type unchanged, including a
	// list; a blank input would clear it on the next save.
	assert.equal(
		toFormValue({ key: 'rating', label: 'Rating', type: 'number', value: ['a', 'b'] }),
		'["a","b"]'
	);
	assert.equal(toFormValue({ key: 'taken', label: 'Taken', type: 'date', value: ['a'] }), '["a"]');
	assert.equal(
		toFormValue({ key: 'featured', label: 'Featured', type: 'boolean', value: ['a'] }),
		'["a"]'
	);
});

test('a tags field keeps its list, and an empty stored value is empty text', () => {
	assert.deepEqual(
		toFormValue({ key: 'tags', label: 'Tags', type: 'tags', value: ['sea', 'dune'] }),
		['sea', 'dune']
	);
	assert.deepEqual(toFormValue({ key: 'tags', label: 'Tags', type: 'tags', value: [] }), []);
	assert.equal(toFormValue({ key: 'rating', label: 'Rating', type: 'number', value: '' }), '');
	assert.equal(
		toFormValue({ key: 'featured', label: 'Featured', type: 'boolean', value: false }),
		false
	);
});

test('folding the buffer back gives the saved response its original shape', () => {
	assert.equal(
		toStoredValue({ key: 'rating', label: 'Rating', type: 'number', value: '' }, '4.5'),
		4.5
	);
	assert.equal(
		toStoredValue({ key: 'rating', label: 'Rating', type: 'number', value: '' }, 'five'),
		'five'
	);
	assert.equal(
		toStoredValue({ key: 'featured', label: 'Featured', type: 'boolean', value: false }, true),
		true
	);
	assert.equal(
		toStoredValue({ key: 'featured', label: 'Featured', type: 'boolean', value: true }, false),
		false
	);
	assert.equal(
		toStoredValue({ key: 'featured', label: 'Featured', type: 'boolean', value: false }, 'yes'),
		'yes'
	);
	assert.deepEqual(
		toStoredValue({ key: 'tags', label: 'Tags', type: 'tags', value: [] }, ['sea']),
		['sea']
	);
	assert.deepEqual(toStoredValue({ key: 'tags', label: 'Tags', type: 'tags', value: [] }, []), []);
});

test('only an empty value counts as empty for a required field', () => {
	assert.equal(isEmptyFormValue(''), true);
	assert.equal(isEmptyFormValue('   '), true);
	assert.equal(isEmptyFormValue(undefined), true);
	assert.equal(isEmptyFormValue([]), true);
	assert.equal(isEmptyFormValue(false), true);
	assert.equal(isEmptyFormValue('0'), false);
	assert.equal(isEmptyFormValue(0), false);
	assert.equal(isEmptyFormValue(true), false);
	assert.equal(isEmptyFormValue(['sea']), false);
});

test('a number input is used for numeric text and falls back to text for a hand-written value', () => {
	assert.equal(isNumericText('4.5'), true);
	assert.equal(isNumericText('-12'), true);
	assert.equal(isNumericText('.5'), true);
	assert.equal(isNumericText('1e3'), true);
	assert.equal(isNumericText(''), false);
	assert.equal(isNumericText('five'), false);
	// `Number()` accepts these, a number input does not.
	assert.equal(isNumericText('0x10'), false);
	assert.equal(isNumericText('0b101'), false);

	assert.equal(numberInputType(''), 'number');
	assert.equal(numberInputType('4.5'), 'number');
	assert.equal(numberInputType('five'), 'text');
	assert.equal(numberInputType('0x10'), 'text');
});

test('a date input falls back to text for a malformed or impossible day', () => {
	assert.equal(isIsoDate('2026-10-19'), true);
	assert.equal(isIsoDate('2026-02-30'), false);
	assert.equal(isIsoDate('19/10/2026'), false);
	assert.equal(isIsoDate('2026-2-3'), false);
	// A year below 1 is not a date a date input can hold.
	assert.equal(isIsoDate('0000-01-01'), false);
	assert.equal(isIsoDate('0099-01-01'), true);

	assert.equal(dateInputType(''), 'date');
	assert.equal(dateInputType('2026-10-19'), 'date');
	assert.equal(dateInputType('2026-02-30'), 'text');
	assert.equal(dateInputType('19/10/2026'), 'text');
});
