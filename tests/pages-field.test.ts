import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	normalizeStartRoute,
	pagesFieldScope,
	isListedPage,
	canExpandAt,
	isInScope,
} from '../src/lib/utils/pages-field.ts';

test('start_route is normalized, and an empty one means the whole site', () => {
	assert.equal(normalizeStartRoute('/root'), '/root');
	assert.equal(normalizeStartRoute('root/'), '/root');
	assert.equal(normalizeStartRoute(' /blog/posts/ '), '/blog/posts');
	assert.equal(normalizeStartRoute(''), '/');
	assert.equal(normalizeStartRoute('/'), '/');
	assert.equal(normalizeStartRoute(undefined), '/');
	assert.equal(normalizeStartRoute(null), '/');
});

test('defaults match a field with no options', () => {
	assert.deepEqual(pagesFieldScope({}), { start: '/', showAll: true, showModular: false, levels: null });
});

test('limit_levels counts like classic: 2 is one level below the start', () => {
	assert.equal(pagesFieldScope({ limit_levels: 2 }).levels, 1);
	assert.equal(pagesFieldScope({ limit_levels: '3' }).levels, 2);
	assert.equal(pagesFieldScope({ limit_levels: 1 }).levels, 1);
	assert.equal(pagesFieldScope({ limit_levels: false }).levels, null);
	assert.equal(pagesFieldScope({ limit_levels: 0 }).levels, null);
});

test('show_all: false keeps routable pages and, with show_modular, modules (module-reuse)', () => {
	const scope = pagesFieldScope({ show_all: false, show_modular: true, start_route: '/root' });
	assert.equal(isListedPage({ template: 'default', routable: true }, scope), true);
	assert.equal(isListedPage({ template: 'default', routable: false }, scope), false);
	assert.equal(isListedPage({ template: 'modular/hero', routable: false }, scope), true);
	assert.equal(isListedPage({ template: 'hero', folder: '_hero', routable: false }, scope), true);
});

test('modules stay hidden without show_modular; show_all keeps non-routable pages', () => {
	const scope = pagesFieldScope({});
	assert.equal(isListedPage({ template: 'modular/hero', routable: false }, scope), false);
	assert.equal(isListedPage({ template: 'default', routable: false }, scope), true);
});

test('rows open only while the level limit allows', () => {
	const two = pagesFieldScope({ limit_levels: 3 });
	assert.equal(canExpandAt(0, two), true);
	assert.equal(canExpandAt(1, two), false);
	assert.equal(canExpandAt(0, pagesFieldScope({ limit_levels: 2 })), false);
	assert.equal(canExpandAt(9, pagesFieldScope({})), true);
});

test('search results are kept to the start route and the level limit', () => {
	const scope = pagesFieldScope({ start_route: '/root', limit_levels: 3 });
	assert.equal(isInScope('/root/a', scope), true);
	assert.equal(isInScope('/root/a/b', scope), true);
	assert.equal(isInScope('/root/a/b/c', scope), false);
	assert.equal(isInScope('/root', scope), false);
	assert.equal(isInScope('/rootless', scope), false);
	assert.equal(isInScope('/blog', scope), false);

	const site = pagesFieldScope({});
	assert.equal(isInScope('/blog', site), true);
	assert.equal(isInScope('/blog/a/b/c', site), true);
});
