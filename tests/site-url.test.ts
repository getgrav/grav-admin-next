import { test } from 'node:test';
import assert from 'node:assert/strict';
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
