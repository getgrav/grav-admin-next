import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pluginModuleUrl, widgetScriptModule } from '../src/lib/utils/plugin-module-url.ts';

// getgrav/grav-plugin-admin2#212: plugin web components are imported from the
// API's same-origin module route instead of blob: URLs, so a strict CSP works.

const API = '/sub/api/v1';

test('a page module names the plugin and carries its tag and version', () => {
	assert.equal(
		pluginModuleUrl(API, { type: 'page', slug: 'crosspost', tag: 'grav-crosspost--page', version: '6a0f-1b2' }),
		'/sub/api/v1/admin-next/modules/plugins/crosspost/page?tag=grav-crosspost--page&v=6a0f-1b2',
	);
});

test('a field module names its file, and a theme field its kind', () => {
	assert.equal(
		pluginModuleUrl(API, { type: 'field', slug: 'quark', kind: 'themes', name: 'swatch', tag: 'grav-quark--swatch' }),
		'/sub/api/v1/admin-next/modules/themes/quark/field/swatch?tag=grav-quark--swatch',
	);
});

test('without a version there is no v', () => {
	const url = pluginModuleUrl(API, { type: 'modal', slug: 'youtube', name: 'youtube-insert', tag: 'grav-youtube--modal-youtube-insert', version: null });
	assert.equal(new URL(url, 'https://site.test').searchParams.has('v'), false);
});

test('path segments are encoded', () => {
	const url = pluginModuleUrl(API, { type: 'report', slug: 'a b', name: '../x', tag: 'grav-a--x' });
	assert.equal(url, '/sub/api/v1/admin-next/modules/plugins/a%20b/report/..%2Fx?tag=grav-a--x');
});

test('a dashboard widget on the plugin widget script maps to its module', () => {
	assert.deepEqual(widgetScriptModule('/gpm/plugins/views/widget-script'), { slug: 'views' });
	assert.equal(widgetScriptModule('/my-plugin/custom.js'), null);
	assert.equal(widgetScriptModule('/gpm/plugins/views/widget-script?x=1'), null);
	assert.equal(widgetScriptModule('https://cdn.example.com/gpm/plugins/x/widget-script'), null);
});
