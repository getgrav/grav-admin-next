import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	asSidebarLayout,
	layoutToSave,
	moveSidebarItem,
	resolveSidebarOrder,
	sameSidebar,
	visibleSidebarIds,
} from '../src/lib/utils/sidebar-layout.ts';

const DEFAULTS = ['dashboard', 'configuration', 'users', 'pages', 'divider', 'plugin:licenses', 'plugin:kahunacart'];

test('an empty order is the built-in order', () => {
	assert.deepEqual(resolveSidebarOrder(DEFAULTS, []), DEFAULTS);
});

test('a saved order puts a plugin item under Dashboard', () => {
	const order = ['dashboard', 'plugin:kahunacart', 'configuration', 'users', 'pages', 'divider', 'plugin:licenses'];
	assert.deepEqual(resolveSidebarOrder(DEFAULTS, order), order);
});

test('saved ids the sidebar does not have are skipped, and duplicates count once', () => {
	const order = ['plugin:gone', 'pages', 'pages', 'dashboard', 'configuration', 'users', 'divider', 'plugin:licenses', 'plugin:kahunacart'];
	assert.deepEqual(resolveSidebarOrder(DEFAULTS, order), ['pages', 'dashboard', 'configuration', 'users', 'divider', 'plugin:licenses', 'plugin:kahunacart']);
});

test('a plugin item the saved order does not know goes last', () => {
	const order = ['dashboard', 'plugin:kahunacart', 'configuration', 'users', 'pages', 'divider', 'plugin:licenses'];
	const defaults = [...DEFAULTS.slice(0, 6), 'plugin:kahunacart', 'plugin:newcomer'];
	assert.deepEqual(resolveSidebarOrder(defaults, order), [...order, 'plugin:newcomer']);
});

test('a core item the saved order does not know keeps its place after the item before it', () => {
	const order = ['plugin:kahunacart', 'pages', 'dashboard', 'divider', 'plugin:licenses'];
	const defaults = ['dashboard', 'reports', 'pages', 'divider', 'plugin:licenses', 'plugin:kahunacart'];
	assert.deepEqual(resolveSidebarOrder(defaults, order), ['plugin:kahunacart', 'pages', 'dashboard', 'reports', 'divider', 'plugin:licenses']);
	// With nothing before it placed, it goes first.
	assert.deepEqual(resolveSidebarOrder(['reports', 'pages'], ['pages']), ['reports', 'pages']);
});

test('moving an item', () => {
	assert.deepEqual(moveSidebarItem(['a', 'b', 'c', 'd'], 'd', 1), ['a', 'd', 'b', 'c']);
	assert.deepEqual(moveSidebarItem(['a', 'b', 'c', 'd'], 'a', 2), ['b', 'c', 'a', 'd']);
	assert.deepEqual(moveSidebarItem(['a', 'b'], 'a', 9), ['b', 'a']);
	assert.deepEqual(moveSidebarItem(['a', 'b'], 'b', -3), ['b', 'a']);
	const same = ['a', 'b'];
	assert.equal(moveSidebarItem(same, 'x', 0), same);
});

test('hidden items are not drawn', () => {
	assert.deepEqual(visibleSidebarIds(DEFAULTS, ['users', 'plugin:licenses']), ['dashboard', 'configuration', 'pages', 'divider', 'plugin:kahunacart']);
});

test('a divider is drawn only between two items', () => {
	assert.deepEqual(visibleSidebarIds(['dashboard', 'pages', 'divider'], []), ['dashboard', 'pages']);
	assert.deepEqual(visibleSidebarIds(['divider', 'dashboard'], []), ['dashboard']);
	assert.deepEqual(visibleSidebarIds(['dashboard', 'divider', 'plugin:a'], ['plugin:a']), ['dashboard']);
	assert.deepEqual(visibleSidebarIds(['dashboard', 'divider', 'plugin:a'], ['divider']), ['dashboard', 'plugin:a']);
});

const CHILDREN = ['plugin:kahunacart/orders', 'plugin:kahunacart/customers'];

test('the built-in order saves as an empty order', () => {
	assert.deepEqual(layoutToSave(DEFAULTS, [...DEFAULTS], []), { order: [], hidden: [] });
	assert.deepEqual(layoutToSave(DEFAULTS, [...DEFAULTS], ['users']), { order: [], hidden: ['users'] });
	const moved = moveSidebarItem(DEFAULTS, 'plugin:kahunacart', 1);
	assert.deepEqual(layoutToSave(DEFAULTS, moved, ['gone']), { order: moved, hidden: [] });
});

test('hidden sub-items are saved, and only ones the sidebar has', () => {
	assert.deepEqual(
		layoutToSave(DEFAULTS, [...DEFAULTS], ['plugin:kahunacart/customers', 'plugin:gone/x', 'users'], CHILDREN),
		{ order: [], hidden: ['users', 'plugin:kahunacart/customers'] },
	);
});

test('two layouts that draw the same sidebar are the same', () => {
	const empty = { order: [], hidden: [] };
	assert.equal(sameSidebar(DEFAULTS, empty, { order: DEFAULTS, hidden: ['plugin:gone', 'plugin:gone/x'] }, CHILDREN), true);
	assert.equal(sameSidebar(DEFAULTS, empty, { order: [], hidden: ['pages'] }), false);
	assert.equal(sameSidebar(DEFAULTS, empty, { order: ['plugin:kahunacart'], hidden: [] }), false);
	assert.equal(sameSidebar(DEFAULTS, empty, { order: [], hidden: ['plugin:kahunacart/orders'] }, CHILDREN), false);
});

test('a layout from the server is read defensively', () => {
	assert.deepEqual(asSidebarLayout(null), { order: [], hidden: [] });
	assert.deepEqual(asSidebarLayout({ order: ['a', 3, 'b'], hidden: 'x' }), { order: ['a', 'b'], hidden: [] });
});
