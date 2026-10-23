import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	asSidebarLayout,
	layoutToSave,
	moveSidebarItem,
	resolveSidebarOrder,
	sameSidebar,
	shownShortcuts,
	visibleSidebarIds,
	withShortcut,
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

const CHILDREN = [{ id: 'orders', default: true }, { id: 'customers' }, { id: 'products', default: true }];
const NONE = { order: [], hidden: [], shortcuts: {} };

test('the built-in order saves as an empty order', () => {
	assert.deepEqual(layoutToSave(DEFAULTS, [...DEFAULTS], []), NONE);
	assert.deepEqual(layoutToSave(DEFAULTS, [...DEFAULTS], ['users']), { ...NONE, hidden: ['users'] });
	const moved = moveSidebarItem(DEFAULTS, 'plugin:kahunacart', 1);
	assert.deepEqual(layoutToSave(DEFAULTS, moved, ['gone']), { ...NONE, order: moved });
	assert.deepEqual(layoutToSave(DEFAULTS, [...DEFAULTS], [], { 'plugin:kahunacart': ['customers'] }), { ...NONE, shortcuts: { 'plugin:kahunacart': ['customers'] } });
});

test('an item nobody picked shortcuts for shows its defaults', () => {
	assert.deepEqual(shownShortcuts({}, 'plugin:kahunacart', CHILDREN), ['orders', 'products']);
	assert.deepEqual(shownShortcuts({ 'plugin:kahunacart': [] }, 'plugin:kahunacart', CHILDREN), []);
	// Picked ones show in the plugin's order, and ones it no longer offers drop out.
	assert.deepEqual(shownShortcuts({ 'plugin:kahunacart': ['products', 'gone', 'customers'] }, 'plugin:kahunacart', CHILDREN), ['customers', 'products']);
});

test('starring a shortcut starts from what shows', () => {
	assert.deepEqual(withShortcut({}, 'plugin:kahunacart', CHILDREN, 'customers', true), { 'plugin:kahunacart': ['orders', 'customers', 'products'] });
	assert.deepEqual(withShortcut({}, 'plugin:kahunacart', CHILDREN, 'orders', false), { 'plugin:kahunacart': ['products'] });
	assert.deepEqual(withShortcut({ 'plugin:x': ['a'] }, 'plugin:kahunacart', CHILDREN, 'orders', true), { 'plugin:x': ['a'], 'plugin:kahunacart': ['orders', 'products'] });
});

test('two layouts that draw the same sidebar are the same', () => {
	const byItem = { 'plugin:kahunacart': CHILDREN };
	assert.equal(sameSidebar(DEFAULTS, NONE, { order: DEFAULTS, hidden: ['plugin:gone'], shortcuts: {} }, byItem), true);
	// Picking exactly the defaults draws the same sidebar.
	assert.equal(sameSidebar(DEFAULTS, NONE, { ...NONE, shortcuts: { 'plugin:kahunacart': ['orders', 'products'] } }, byItem), true);
	assert.equal(sameSidebar(DEFAULTS, NONE, { ...NONE, hidden: ['pages'] }), false);
	assert.equal(sameSidebar(DEFAULTS, NONE, { ...NONE, order: ['plugin:kahunacart'] }), false);
	assert.equal(sameSidebar(DEFAULTS, NONE, { ...NONE, shortcuts: { 'plugin:kahunacart': ['orders'] } }, byItem), false);
});

test('a layout from the server is read defensively', () => {
	assert.deepEqual(asSidebarLayout(null), NONE);
	assert.deepEqual(asSidebarLayout({ order: ['a', 3, 'b'], hidden: 'x', shortcuts: [] }), { ...NONE, order: ['a', 'b'] });
	assert.deepEqual(asSidebarLayout({ shortcuts: { 'plugin:a': ['x', 1], 'plugin:b': 'x' } }), { ...NONE, shortcuts: { 'plugin:a': ['x'] } });
});
