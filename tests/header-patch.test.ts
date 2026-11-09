import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHeaderPatch } from '../src/lib/utils/dot-path.ts';

const saved = {
	title: 'Page',
	permissions: {
		inherit: true,
		groups: { defaults: 'crump', editors: { update: true, publish: true, media: false } },
	},
	paneles: [{ kicker: 'a', meta: { x: 1 } }, { kicker: 'b' }],
};

test('a key removed from a map field is sent as null so the API drops it', () => {
	const patch = buildHeaderPatch({ 'permissions.groups': { defaults: 'crump', procras: 'm' } }, saved, saved);
	assert.deepEqual(patch, { permissions: { groups: { defaults: 'crump', procras: 'm', editors: null } } });
});

test('a key removed from a nested map is sent as null too', () => {
	const groups = { defaults: 'crump', editors: { update: true, publish: true } };
	const patch = buildHeaderPatch({ 'permissions.groups': groups }, saved, saved);
	assert.deepEqual(patch, {
		permissions: { groups: { defaults: 'crump', editors: { update: true, publish: true, media: null } } },
	});
});

test('sibling keys outside the edited field are left alone', () => {
	const patch = buildHeaderPatch({ 'permissions.groups': saved.permissions.groups }, saved, saved);
	assert.equal('inherit' in (patch.permissions as Record<string, unknown>), false);
});

test('an edit inside a list sends the whole list and no nulls', () => {
	const patch = buildHeaderPatch({ 'paneles.0.meta': {} }, saved, saved);
	assert.deepEqual(patch, { paneles: [{ kicker: 'a', meta: {} }, { kicker: 'b' }] });
});

test('scalars, lists and new keys pass through unchanged', () => {
	assert.deepEqual(buildHeaderPatch({ title: 'New' }, saved, saved), { title: 'New' });
	assert.deepEqual(buildHeaderPatch({ tags: ['a'] }, saved, saved), { tags: ['a'] });
	assert.deepEqual(buildHeaderPatch({ 'extra.key': { a: 1 } }, saved, saved), { extra: { key: { a: 1 } } });
});

test('without a saved header nothing is marked for removal', () => {
	const patch = buildHeaderPatch({ 'permissions.groups': { defaults: 'c' } }, saved);
	assert.deepEqual(patch, { permissions: { groups: { defaults: 'c' } } });
});
