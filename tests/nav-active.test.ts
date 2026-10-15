import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isActiveRoute } from '../src/lib/utils/nav-active.ts';

// getgrav/grav-plugin-admin2#195: plugin routes that share a prefix
// (/plugin/foo and /plugin/foo-bar) both lit up in the sidebar.

for (const base of ['/admin', '']) {
	test(`a route is not active on a sibling that merely shares its prefix (base "${base}")`, () => {
		assert.equal(isActiveRoute(`${base}/plugin/foo-bar`, `${base}/plugin/foo`, base), false);
		assert.equal(isActiveRoute(`${base}/plugin/foo-bar`, `${base}/plugin/foo-bar`, base), true);
		assert.equal(isActiveRoute(`${base}/flex-objects/accounts2`, `${base}/flex-objects/accounts`, base), false);
	});

	test(`a route stays active on the routes below it (base "${base}")`, () => {
		assert.equal(isActiveRoute(`${base}/config/system`, `${base}/config`, base), true);
		assert.equal(isActiveRoute(`${base}/pages/edit/blog/post`, `${base}/pages`, base), true);
		assert.equal(isActiveRoute(`${base}/flex-objects/accounts/new`, `${base}/flex-objects/accounts`, base), true);
		assert.equal(isActiveRoute(`${base}/plugins/foo`, `${base}/plugins`, base), true);
		assert.equal(isActiveRoute(`${base}/plugin/foo`, `${base}/plugins`, base), false);
	});

	test(`trailing slashes and hashes do not change the match (base "${base}")`, () => {
		assert.equal(isActiveRoute(`${base}/pages/`, `${base}/pages`, base), true);
		assert.equal(isActiveRoute(`${base}/flex-objects/accounts`, `${base}/flex-objects/accounts/`, base), true);
		assert.equal(isActiveRoute(`${base}/plugin/foo`, `${base}/plugin/foo#/settings`, base), true);
		assert.equal(isActiveRoute(`${base}/plugin/foo-bar`, `${base}/plugin/foo#/settings`, base), false);
	});

	// getgrav/grav-plugin-admin2#196: sidebar links to one plugin page that
	// differ only by ?view= all lit up at once.
	test(`a link's query parameters must be in the current URL (base "${base}")`, () => {
		const orders = `${base}/plugin/shop?view=orders`;
		const customers = `${base}/plugin/shop?view=customers`;
		assert.equal(isActiveRoute(`${base}/plugin/shop`, orders, base, '?view=orders'), true);
		assert.equal(isActiveRoute(`${base}/plugin/shop`, customers, base, '?view=orders'), false);
		assert.equal(isActiveRoute(`${base}/plugin/shop`, orders, base, ''), false);
		assert.equal(isActiveRoute(`${base}/plugin/shop`, orders, base, '?page=2&view=orders'), true);
		assert.equal(isActiveRoute(`${base}/plugin/shop/42`, orders, base, '?view=orders'), true);
		// A link without a query string ignores the current one.
		assert.equal(isActiveRoute(`${base}/plugin/shop`, `${base}/plugin/shop`, base, '?view=orders'), true);
		assert.equal(isActiveRoute(`${base}/plugin/shop-x`, orders, base, '?view=orders'), false);
	});

	test(`the dashboard root only matches itself (base "${base}")`, () => {
		assert.equal(isActiveRoute(`${base}/`, `${base}/`, base), true);
		assert.equal(isActiveRoute(base || '/', `${base}/`, base), true);
		assert.equal(isActiveRoute(`${base}/pages`, `${base}/`, base), false);
	});
}
