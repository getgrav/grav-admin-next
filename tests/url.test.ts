import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webUrl, safeHref } from '../src/lib/utils/url.ts';

const SITE = 'https://site.test';

// A package's homepage comes from third-party metadata and Svelte doesn't filter
// `href`: only an absolute http(s) address may become a link.

test('an http(s) address is kept', () => {
	assert.equal(webUrl('https://github.com/getgrav/grav-plugin-admin'), 'https://github.com/getgrav/grav-plugin-admin');
	assert.equal(webUrl('http://example.com/plugin'), 'http://example.com/plugin');
	assert.equal(webUrl('  https://getgrav.org  '), 'https://getgrav.org/');
});

test('a script or other non-web scheme is no link', () => {
	assert.equal(webUrl('javascript:alert(1)'), null);
	assert.equal(webUrl('JavaScript:alert(1)'), null);
	assert.equal(webUrl(' java\tscript:alert(1)'), null);
	assert.equal(webUrl('data:text/html,<script>alert(1)</script>'), null);
	assert.equal(webUrl('mailto:dev@example.com'), null);
});

test('a relative or incomplete address is no link', () => {
	assert.equal(webUrl(''), null);
	assert.equal(webUrl('/plugins/admin'), null);
	assert.equal(webUrl('github.com/getgrav/grav-plugin-admin'), null);
});

test('a value that is not text is no link', () => {
	for (const value of [null, undefined, false, 1, {}, ['https://getgrav.org']]) {
		assert.equal(webUrl(value), null);
		assert.equal(safeHref(value, SITE), null);
	}
});

// safeHref() also takes paths on the site, for column values such as `/admin/users/joe`.

test('a path on the site becomes a link on the site', () => {
	assert.equal(safeHref('/admin/users/joe', SITE), 'https://site.test/admin/users/joe');
	assert.equal(safeHref('  reports/today ', SITE), 'https://site.test/reports/today');
});

test('a path that leaves the site is no link', () => {
	// Browsers read a backslash as a slash, so these name another host.
	assert.equal(safeHref('/\\evil.example/login', SITE), null);
	assert.equal(safeHref('\\\\evil.example', SITE), null);
	assert.equal(safeHref('//evil.example/login', SITE), null);
});

test('an http(s) address is a link, a script is not', () => {
	assert.equal(safeHref('https://getgrav.org/downloads', SITE), 'https://getgrav.org/downloads');
	assert.equal(safeHref('javascript:alert(1)', SITE), null);
	assert.equal(safeHref('data:text/html,x', SITE), null);
	assert.equal(safeHref('   ', SITE), null);
});
