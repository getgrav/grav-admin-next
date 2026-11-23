import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listControls } from '../src/lib/utils/list-controls.ts';

// admin2#225: `controls` and `placement` follow classic admin's list template.

test('controls defaults to a bottom bar only', () => {
	const c = listControls({});
	assert.equal(c.top, false);
	assert.equal(c.bottom, true);
});

test('controls: top draws the bar above the rows only', () => {
	const c = listControls({ controls: 'top' });
	assert.equal(c.top, true);
	assert.equal(c.bottom, false);
});

test('controls: both draws a bar above and below', () => {
	const c = listControls({ controls: 'both' });
	assert.equal(c.top, true);
	assert.equal(c.bottom, true);
});

test('an unknown controls value falls back to the bottom bar, never none', () => {
	for (const controls of ['none', '1', 'sideways', '']) {
		const c = listControls({ controls });
		assert.equal(c.top, false, controls);
		assert.equal(c.bottom, true, controls);
	}
	assert.deepEqual(listControls({ controls: 'BOTH' }).top, true);
});

test('new rows are appended by default, from either bar', () => {
	const c = listControls({ controls: 'both' });
	assert.equal(c.topAdds, 'bottom');
	assert.equal(c.bottomAdds, 'bottom');
});

test('placement: top prepends from either bar', () => {
	const c = listControls({ controls: 'both', placement: 'top' });
	assert.equal(c.topAdds, 'top');
	assert.equal(c.bottomAdds, 'top');
});

test('placement: position adds at the end the button sits at', () => {
	const c = listControls({ controls: 'both', placement: 'position' });
	assert.equal(c.topAdds, 'top');
	assert.equal(c.bottomAdds, 'bottom');
});
