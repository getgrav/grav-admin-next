import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retinaLabel } from '../src/lib/utils/retina.ts';

test('no retina files gives no label', () => {
	assert.equal(retinaLabel(undefined), '');
	assert.equal(retinaLabel([]), '');
	assert.equal(retinaLabel([1]), '');
});

test('up to three scales are listed in order', () => {
	assert.equal(retinaLabel([3, 2]), '@2x @3x');
	assert.equal(retinaLabel([2, 3, 4]), '@2x @3x @4x');
});

test('a longer run shows its range', () => {
	assert.equal(retinaLabel([2, 3, 4, 10]), '@2x–@10x');
});

test('the full form lists every scale', () => {
	assert.equal(retinaLabel([2, 3, 4, 10], true), '@2x, @3x, @4x, @10x');
});
