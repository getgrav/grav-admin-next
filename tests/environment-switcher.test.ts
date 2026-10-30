import { test } from 'node:test';
import assert from 'node:assert/strict';
import { environmentSwitcherVisible } from '../src/lib/utils/environment-switcher.ts';

// The top bar's environment switcher: shown when there's something to pick,
// or to someone who could create something to pick.

const DEFAULT_ONLY = [{ name: '' }];
const WITH_ENV = [{ name: '' }, { name: 'example.com' }];

test('a site with no environments shows it only to users who can write config', () => {
	assert.equal(environmentSwitcherVisible({ target: '', environments: DEFAULT_ONLY, canManage: true }), true);
	assert.equal(environmentSwitcherVisible({ target: '', environments: DEFAULT_ONLY, canManage: false }), false);
});

test('a site with an environment shows it to everyone', () => {
	assert.equal(environmentSwitcherVisible({ target: '', environments: WITH_ENV, canManage: false }), true);
});

test('it always shows while an environment is selected', () => {
	// Even before the list has loaded, or if the selected one has gone.
	assert.equal(environmentSwitcherVisible({ target: 'example.com', environments: [], canManage: false }), true);
});

test('until the list loads, only a user who can write config sees it', () => {
	assert.equal(environmentSwitcherVisible({ target: '', environments: [], canManage: true }), true);
	assert.equal(environmentSwitcherVisible({ target: '', environments: [], canManage: false }), false);
});
