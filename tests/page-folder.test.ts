import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageFolderName } from '../src/lib/utils/page-folder.ts';

test('a slug override does not replace the folder name (admin-next#40)', () => {
	assert.equal(pageFolderName({ folder: '02.typography', slug: 'my-slug' }), 'typography');
});

test('the numeric order prefix is dropped, whatever its width', () => {
	assert.equal(pageFolderName({ folder: '02.typography', slug: 'typography' }), 'typography');
	assert.equal(pageFolderName({ folder: '005.typography', slug: 'typography' }), 'typography');
});

test('an unprefixed folder and a module folder keep their name', () => {
	assert.equal(pageFolderName({ folder: 'typography', slug: 'my-slug' }), 'typography');
	assert.equal(pageFolderName({ folder: '03._hero', slug: '_hero' }), '_hero');
});

test('only the leading number and dot go, not a number inside the name', () => {
	assert.equal(pageFolderName({ folder: '2024.report', slug: '2024.report' }), 'report');
	assert.equal(pageFolderName({ folder: 'v2.0-notes', slug: 'v2.0-notes' }), 'v2.0-notes');
});

test('leading periods are dropped, as the move endpoint drops them', () => {
	assert.equal(pageFolderName({ folder: '04..slug', slug: '.slug' }), 'slug');
});

test('an API without `folder` falls back to the slug', () => {
	assert.equal(pageFolderName({ slug: 'typography' }), 'typography');
	assert.equal(pageFolderName({ folder: null, slug: 'typography' }), 'typography');
});
