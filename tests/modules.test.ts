import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isModule, isModularPage, humanizeType, moduleTypeLabel, stepInsertIndex } from '../src/lib/utils/modules.ts';
import { buildMoveOps, fullInsertIndex } from '../src/lib/utils/reorganize-ops.ts';

test('a module is a folder starting with an underscore, order prefix or not', () => {
	assert.equal(isModule({ folder: '01._hero', slug: '_hero' }), true);
	assert.equal(isModule({ slug: '_hero' }), true);
	assert.equal(isModule({ folder: '02.about', slug: 'about' }), false);
	assert.equal(isModule({ folder: 'my_page' }), false);
});

test('a modular page is told by its template or its collection', () => {
	assert.equal(isModularPage({ template: 'modular', slug: 'home' }), true);
	assert.equal(isModularPage({ template: 'home', slug: 'home', header: { content: { items: '@self.modular' } } }), true);
	assert.equal(isModularPage({ template: 'home', slug: 'home', header: { content: { items: 'self@.modular' } } }), true);
	assert.equal(isModularPage({ template: 'home', slug: 'home', header: { content: { items: { '@self': 'modular' } } } }), true);
	assert.equal(isModularPage({ template: 'blog', slug: 'blog', header: { content: { items: '@self.children' } } }), false);
	assert.equal(isModularPage({ template: 'default', slug: 'about' }), false);
	// A module is not a modular page, even with the modular template's name.
	assert.equal(isModularPage({ template: 'modular/text', folder: '01._text' }), false);
	assert.equal(isModularPage(null), false);
});

test('a module type is called by the label the API lists, or its readable name', () => {
	const types = [{ type: 'modular/hero', label: 'Big opening' }];
	assert.equal(moduleTypeLabel('modular/hero', types), 'Big opening');
	assert.equal(moduleTypeLabel('hero', types), 'Big opening');
	assert.equal(moduleTypeLabel('modular/featured_product', types), 'Featured product');
	assert.equal(moduleTypeLabel(undefined, types), '');
	assert.equal(humanizeType('modular/license-check'), 'License check');
});

test('one step up or down drops the module where buildMoveOps expects it', () => {
	assert.equal(stepInsertIndex(0, 3, -1), null);
	assert.equal(stepInsertIndex(2, 3, 1), null);
	assert.equal(stepInsertIndex(1, 3, -1), 0);
	assert.equal(stepInsertIndex(1, 3, 1), 3);

	// Three numbered modules: moving the first one down swaps it with the second.
	const siblings = [
		{ route: '/home/_hero', order: '01.' },
		{ route: '/home/_road', order: '02.' },
		{ route: '/home/_record', order: '03.' },
	];
	const routes = siblings.map((p) => p.route);
	const insertAt = fullInsertIndex(routes, routes, stepInsertIndex(0, 3, 1)!);
	assert.deepEqual(
		buildMoveOps({ page: siblings[0], fromParent: '/home', toParent: '/home', siblings, insertAt }),
		[{ route: '/home/_hero', position: 2 }, { route: '/home/_road', position: 1 }],
	);
});

test('a page among the modules that is not one keeps its place in the numbering', () => {
	// The list shows modules only; the drop position is found in the full child list.
	const all = ['/home/_hero', '/home/gallery', '/home/_road'];
	const shown = ['/home/_hero', '/home/_road'];
	assert.equal(fullInsertIndex(shown, all, 0), 0);
	assert.equal(fullInsertIndex(shown, all, 2), 3);
});
