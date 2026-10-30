import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageLabel, pageTitleIfDifferent } from '../src/lib/utils/page-label.ts';

test('a page with a menu label is listed by it (admin2#205)', () => {
	const page = { title: 'Our Company History', menu: 'About' };
	assert.equal(pageLabel(page), 'About');
	assert.equal(pageTitleIfDifferent(page), 'Our Company History');
});

test('a page whose menu is its title shows the title and no hint', () => {
	const page = { title: 'Blog', menu: 'Blog' };
	assert.equal(pageLabel(page), 'Blog');
	assert.equal(pageTitleIfDifferent(page), undefined);
});

test('an empty, blank or missing menu falls back to the title', () => {
	assert.equal(pageLabel({ title: 'Blog', menu: '' }), 'Blog');
	assert.equal(pageLabel({ title: 'Blog', menu: '   ' }), 'Blog');
	assert.equal(pageLabel({ title: 'Blog', menu: null }), 'Blog');
	assert.equal(pageLabel({ title: 'Blog' }), 'Blog');
	assert.equal(pageTitleIfDifferent({ title: 'Blog' }), undefined);
});
