import { test } from 'node:test';
import assert from 'node:assert/strict';
import { environmentSwitcherVisible } from '../src/lib/utils/environment-switcher.ts';

// The top bar's environment switcher: shown when there's something to pick,
// or to someone who could create something to pick.

const DEFAULT_ONLY = [{ name: '' }];
const WITH_ENV = [{ name: '' }, { name: 'example.com' }];

test('a site with no environments shows it only to users who can write config', () => {
	assert.equal(environmentSwitcherVisible({ target: '', environments: DEFAULT_ONLY, mode: 'auto', canManage: true }), true);
	assert.equal(environmentSwitcherVisible({ target: '', environments: DEFAULT_ONLY, mode: 'auto', canManage: false }), false);
});

test('when-used hides it from everyone on a site with no environments', () => {
	assert.equal(environmentSwitcherVisible({ target: '', environments: DEFAULT_ONLY, mode: 'when-used', canManage: true }), false);
});

test('a site with an environment shows it to everyone, in either mode', () => {
	for (const mode of ['auto', 'when-used'] as const) {
		assert.equal(environmentSwitcherVisible({ target: '', environments: WITH_ENV, mode, canManage: false }), true);
	}
});

test('it always shows while an environment is selected', () => {
	// Even before the list has loaded, or if the selected one has gone.
	assert.equal(environmentSwitcherVisible({ target: 'example.com', environments: [], mode: 'when-used', canManage: false }), true);
});

test('until the list loads, only a user who can write config sees it', () => {
	assert.equal(environmentSwitcherVisible({ target: '', environments: [], mode: 'auto', canManage: true }), true);
	assert.equal(environmentSwitcherVisible({ target: '', environments: [], mode: 'auto', canManage: false }), false);
});
