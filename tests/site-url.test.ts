import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileEntryUrl, resolveSiteUrl } from '../src/lib/utils/site-url.ts';

// getgrav/grav-plugin-admin2#203: on a subfolder install a file field's preview
// asked for /sub/sub/user/..., because the stored url already carried the
// subfolder and the field added it again.

const logo = 'user/themes/quark2/images/logo/logo.png';

test('a file field preview on a subfolder install names the subfolder once', () => {
	assert.equal(
		fileEntryUrl({ path: logo, url: `/gravv2/${logo}` }, '/gravv2'),
		`/gravv2/${logo}`,
	);
});

test('a file field preview on a root install is unchanged', () => {
	assert.equal(fileEntryUrl({ path: logo, url: `/${logo}` }, ''), `/${logo}`);
});

test('a site moved into a subfolder after the upload still previews', () => {
	// Saved on a root install, so the url has no subfolder in it.
	assert.equal(fileEntryUrl({ path: logo, url: `/${logo}` }, '/gravv2'), `/gravv2/${logo}`);
	// Moved from one subfolder to another.
	assert.equal(fileEntryUrl({ path: logo, url: `/old/${logo}` }, '/gravv2'), `/gravv2/${logo}`);
});

test('entries saved without a url (classic admin, older admin2) preview from their path', () => {
	assert.equal(fileEntryUrl({ path: logo }, '/gravv2'), `/gravv2/${logo}`);
});

test('an entry with no user/ path falls back to its url', () => {
	assert.equal(fileEntryUrl({ path: 'logo.png', url: `/gravv2/${logo}` }, '/gravv2'), `/gravv2/${logo}`);
	assert.equal(fileEntryUrl({ path: 'logo.png', url: 'https://cdn.example.com/logo.png' }, '/gravv2'), 'https://cdn.example.com/logo.png');
	assert.equal(fileEntryUrl({ path: 'logo.png' }, '/gravv2'), null);
});

test('resolveSiteUrl adds the subfolder only when the url lacks it', () => {
	assert.equal(resolveSiteUrl('/gravv2/user/media/a.png', '/gravv2'), '/gravv2/user/media/a.png');
	assert.equal(resolveSiteUrl('/api/v1/thumbnails/x.png', '/gravv2'), '/gravv2/api/v1/thumbnails/x.png');
	assert.equal(resolveSiteUrl('user/media/a.png', '/gravv2'), '/gravv2/user/media/a.png');
	assert.equal(resolveSiteUrl('/user/media/a.png', ''), '/user/media/a.png');
	// '/gravv2x/...' is not inside '/gravv2'.
	assert.equal(resolveSiteUrl('/gravv2x/a.png', '/gravv2'), '/gravv2/gravv2x/a.png');
});

test('resolveSiteUrl keeps the host of a full server URL', () => {
	assert.equal(resolveSiteUrl('/sub/user/a.png', 'https://example.com/sub/'), 'https://example.com/sub/user/a.png');
	assert.equal(resolveSiteUrl('/api/v1/t.png', 'https://example.com/sub'), 'https://example.com/sub/api/v1/t.png');
	assert.equal(resolveSiteUrl('/user/a.png', 'https://example.com'), 'https://example.com/user/a.png');
});

test('complete URLs are left alone', () => {
	for (const u of ['https://x.test/a.png', 'http://x.test/a.png', '//x.test/a.png', 'data:image/png;base64,AA', 'blob:http://x/1']) {
		assert.equal(resolveSiteUrl(u, '/gravv2'), u);
	}
});

// The API returns two kinds of path: a file's own URL, which already carries
// the subfolder, and the API's routes (thumbnails, the /media/raw fallback),
// which don't. Every view that shows a media file resolves both through
// resolveSiteUrl, so each kind comes out right on every install.

const installs = [
	{ name: 'root install', server: '', origin: '', base: '' },
	{ name: 'subfolder install', server: '/sub', origin: '', base: '/sub' },
	{ name: 'full root URL', server: 'https://example.com', origin: 'https://example.com', base: '' },
	{ name: 'full subfolder URL', server: 'https://example.com/sub/', origin: 'https://example.com', base: '/sub' },
	// A site whose subfolder looks like the start of an API path.
	{ name: 'site at /api', server: '/api', origin: '', base: '/api' },
	{ name: 'full URL, site at /api', server: 'https://example.com/api', origin: 'https://example.com', base: '/api' },
];

for (const { name, server, origin, base } of installs) {
	test(`${name}: a file URL keeps its subfolder once`, () => {
		const file = `${base}/user/pages/01.home/a.png`;
		assert.equal(resolveSiteUrl(file, server), `${origin}${file}`);
		assert.equal(resolveSiteUrl(`${base}/user/media/a b.svg`, server), `${origin}${base}/user/media/a b.svg`);
	});

	test(`${name}: an API path gets the subfolder`, () => {
		for (const api of ['/api/v1/thumbnails/abc.jpg', '/api/v1/media/raw/env/a.png', '/api/v1/users/x/avatar']) {
			assert.equal(resolveSiteUrl(api, server), `${origin}${base}${api}`);
		}
	});

	test(`${name}: an API path that already has the subfolder is left alone`, () => {
		const api = `${base}/api/v1/thumbnails/abc.jpg`;
		assert.equal(resolveSiteUrl(api, server), `${origin}${api}`);
	});

	test(`${name}: a path relative to the site root gets the subfolder`, () => {
		assert.equal(resolveSiteUrl('user/media/a.png', server), `${origin}${base}/user/media/a.png`);
	});

	test(`${name}: complete URLs are left alone`, () => {
		for (const u of ['https://cdn.test/a.png', '//cdn.test/a.png', 'data:image/svg+xml;base64,AA', 'blob:https://x/1']) {
			assert.equal(resolveSiteUrl(u, server), u);
		}
	});
}

test('a custom API route is recognised from the prefix the admin was given', () => {
	// plugins.api.route: /grav-api, on a site at /sub.
	assert.equal(resolveSiteUrl('/grav-api/v1/thumbnails/a.jpg', '/sub', '/grav-api/v1'), '/sub/grav-api/v1/thumbnails/a.jpg');
	assert.equal(resolveSiteUrl('/sub/grav-api/v1/thumbnails/a.jpg', '/sub', '/grav-api/v1'), '/sub/grav-api/v1/thumbnails/a.jpg');
	// A site at /grav-api with the API on that same route.
	assert.equal(resolveSiteUrl('/grav-api/v1/thumbnails/a.jpg', '/grav-api', '/grav-api/v1'), '/grav-api/grav-api/v1/thumbnails/a.jpg');
	assert.equal(resolveSiteUrl('/grav-api/user/media/a.png', '/grav-api', '/grav-api/v1'), '/grav-api/user/media/a.png');
	// A trailing slash on the prefix changes nothing.
	assert.equal(resolveSiteUrl('/api/v1/t.png', '/api', '/api/v1/'), '/api/api/v1/t.png');
});

test('only a whole path segment counts as the API prefix', () => {
	assert.equal(resolveSiteUrl('/api/v10/a.png', '/sub'), '/sub/api/v10/a.png');
	assert.equal(resolveSiteUrl('/api/v1x', '/api'), '/api/v1x');
});

test('fileEntryUrl passes the API prefix through', () => {
	assert.equal(fileEntryUrl({ url: '/api/v1/media/raw/a.png' }, '/api', '/api/v1'), '/api/api/v1/media/raw/a.png');
	assert.equal(fileEntryUrl({ path: logo, url: '/api/v1/media/raw/a.png' }, '/api', '/api/v1'), `/api/${logo}`);
});

// Every view that turns an API media URL into an <img src>, an Open link or a
// copied URL goes through resolveSiteUrl. The hand-rolled versions this
// replaced either added the subfolder to a file URL that already had it, or
// left an API path without it.
test('media views resolve URLs through resolveSiteUrl', () => {
	const root = join(import.meta.dirname, '..');
	const files = [
		'src/lib/components/media/MediaInspector.svelte',
		'src/lib/components/media/PageMedia.svelte',
		'src/lib/components/media/MediaFileDetails.svelte',
		'src/lib/components/media/MediaBrowser.svelte',
		'src/lib/components/media/MediaSourceTabs.svelte',
		'src/lib/components/media/MediaFileCard.svelte',
		'src/lib/components/media/MediaFileRow.svelte',
		'src/lib/components/blueprint/fields/MediaField.svelte',
		'src/lib/components/blueprint/fields/FileField.svelte',
		'src/lib/components/blueprint/fields/FilePickerField.svelte',
		'src/lib/utils/paste-upload.ts',
		'src/routes/pages/edit/[...route]/+page.svelte',
	];
	for (const f of files) {
		const src = readFileSync(join(root, f), 'utf8');
		assert.match(src, /resolveSiteUrl\(/, `${f}: resolve media URLs with resolveSiteUrl`);
		assert.doesNotMatch(
			src,
			/\.startsWith\('\/'\)\s*\?\s*(?:`\$\{auth\.serverUrl\}|\w+\s*:)/,
			`${f}: a leading slash can't tell whether the subfolder is still missing`,
		);
		assert.doesNotMatch(src, /\$\{auth\.serverUrl\}\$\{\w+\.startsWith\('\/'\)/, `${f}: same, written inline`);
	}
});
