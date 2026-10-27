import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missingInListRows, requiredRowFields } from '../src/lib/utils/list-required.ts';

// The scheduler's custom jobs list, as the blueprint endpoint returns it.
const customJobs = {
	name: 'custom_jobs',
	type: 'list',
	fields: [
		{ name: 'custom_jobs.id', type: 'key', label: 'ID', validate: { required: true } },
		{ name: 'custom_jobs.command', type: 'text', label: 'Command', validate: { required: true } },
		{ name: 'custom_jobs.args', type: 'text', label: 'Extra Arguments' },
		{ name: 'custom_jobs.at', type: 'text', label: 'Run At', validate: { required: true } },
		{ name: 'custom_jobs.output_mode', type: 'select', default: 'append' },
	],
};

const missing = (value: unknown) =>
	missingInListRows(customJobs, value).map((m) => `${m.row}:${m.field.name.split('.').pop()}`);

test('a row added and saved untouched is caught (grav-plugin-scheduler-webhook#10)', () => {
	assert.deepEqual(missing({ 1: { output_mode: 'append' } }), ['1:command', '1:at']);
});

test('a filled row passes, and rows are counted from 1 in list order', () => {
	const value = {
		backup: { command: 'bin/grav', at: '0 3 * * *' },
		nightly: { command: '  ', at: '* * * * *' },
	};
	assert.deepEqual(missing(value), ['2:command']);
});

test('an array-mode list and a missing or empty value are read the same way', () => {
	assert.deepEqual(missing([{ command: 'ls' }]), ['1:at']);
	assert.deepEqual(missing([null]), ['1:command', '1:at']);
	assert.deepEqual(missing(undefined), []);
	assert.deepEqual(missing({}), []);
});

test('the key sub-field is not checked, nor are fields that are not required', () => {
	assert.deepEqual(
		requiredRowFields(customJobs).map((f) => f.name),
		['custom_jobs.command', 'custom_jobs.at'],
	);
});

test('a required sub-field with a default counts as filled when the row leaves it empty', () => {
	const list = {
		name: 'rows',
		type: 'list',
		fields: [{ name: 'rows.mode', type: 'select', default: 'append', validate: { required: true } }],
	};
	assert.deepEqual(missingInListRows(list, [{}]), []);
});

test('a field that is not a list has no row check', () => {
	assert.deepEqual(requiredRowFields({ name: 'x', type: 'text', validate: { required: true } }), []);
});
