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
	assert.equal(webUrl('localhost:8080/admin'), null);
	assert.equal(webUrl('admin'), null);
});

// Many blueprints leave out the scheme: a bare host name still links.

test('a host name without a scheme gets https://', () => {
	assert.equal(webUrl('github.com/getgrav/grav-plugin-admin'), 'https://github.com/getgrav/grav-plugin-admin');
	assert.equal(webUrl(' www.example.com '), 'https://www.example.com/');
	assert.equal(webUrl('getgrav.org'), 'https://getgrav.org/');
	assert.equal(webUrl('example.com:8443/docs?x=1#top'), 'https://example.com:8443/docs?x=1#top');
});

test('only a host name gets https://, never a script or credentials', () => {
	assert.equal(webUrl('javascript.example:alert(1)'), null);
	assert.equal(webUrl('user@evil.example'), null);
	assert.equal(webUrl('evil.example@site.test'), null);
	assert.equal(webUrl('-bad.example'), null);
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
	// Browsers read a backslash as a slash, and skip extra slashes, so these
	// look like paths but name another host.
	assert.equal(safeHref('/\\evil.example/login', SITE), null);
	assert.equal(safeHref('\\\\evil.example', SITE), null);
	assert.equal(safeHref('//\\evil.example', SITE), null);
	assert.equal(safeHref('///evil.example/login', SITE), null);
});

test('a protocol-relative address links to its host, like an absolute one', () => {
	assert.equal(safeHref('//cdn.example/avatar.png', SITE), 'https://cdn.example/avatar.png');
});

test('a blob: address is no link, though it names the site', () => {
	assert.equal(safeHref('blob:https://site.test/0b5e', SITE), null);
});

test('a bare file name is a path on the site, not a host', () => {
	assert.equal(safeHref('docs.html', SITE), 'https://site.test/docs.html');
});

test('an http(s) address is a link, a script is not', () => {
	assert.equal(safeHref('https://getgrav.org/downloads', SITE), 'https://getgrav.org/downloads');
	assert.equal(safeHref('javascript:alert(1)', SITE), null);
	assert.equal(safeHref('data:text/html,x', SITE), null);
	assert.equal(safeHref('   ', SITE), null);
});
