import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepConstraint } from '../src/lib/utils/field-constraints.ts';

// A number field with `validate: { step: any }` (a latitude in YetiSearch Pro's
// page blueprint) got no step attribute, because `any` isn't a number, so the
// browser used a step of 1 and marked every decimal value invalid.

test('step any reaches the input, top level or under validate', () => {
	assert.equal(stepConstraint({ name: 'lat', type: 'number', validate: { step: 'any' } }), 'any');
	assert.equal(stepConstraint({ name: 'lat', type: 'number', step: 'any' }), 'any');
	assert.equal(stepConstraint({ name: 'lat', type: 'number', validate: { step: ' ANY ' } }), 'any');
});

test('a numeric step is a number, top level first', () => {
	assert.equal(stepConstraint({ name: 'q', type: 'range', validate: { step: 0.05 } }), 0.05);
	assert.equal(stepConstraint({ name: 'q', type: 'range', validate: { step: '5' } }), 5);
	assert.equal(stepConstraint({ name: 'q', type: 'range', step: 2, validate: { step: 'any' } }), 2);
	assert.equal(
		stepConstraint({ name: 'q', type: 'range', step: 'any', validate: { step: 2 } }),
		'any'
	);
});

test('no step, or one that is neither a number nor any, leaves the browser default', () => {
	assert.equal(stepConstraint({ name: 'n', type: 'number' }), undefined);
	assert.equal(stepConstraint({ name: 'n', type: 'number', validate: { step: '' } }), undefined);
	assert.equal(
		stepConstraint({ name: 'n', type: 'number', validate: { step: 'fine' } }),
		undefined
	);
	assert.equal(
		stepConstraint({ name: 'n', type: 'number', step: 'fine', validate: { step: 0.5 } }),
		0.5
	);
});
