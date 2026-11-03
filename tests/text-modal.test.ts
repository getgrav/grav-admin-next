import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The dashboard, the Plugins and Themes lists and the plugin and theme pages
// all show a README or changelog in one modal. They share createTextModal(), so
// a slow answer never lands after a newer one, a 404 for an update reads as "no
// entries" rather than a failure, and the texts are translated.
//
// Run: node --test tests/text-modal.test.ts

const root = new URL('../src/', import.meta.url).pathname;
const pages = [
	'routes/+page.svelte',
	'routes/plugins/+page.svelte',
	'routes/themes/+page.svelte',
	'routes/plugins/[slug]/+page.svelte',
	'routes/themes/[slug]/+page.svelte',
];

for (const path of pages) {
	const source = readFileSync(join(root, path), 'utf8');

	test(`${path} uses the shared text modal`, () => {
		assert.match(source, /createTextModal\(\)/);
		assert.match(source, /<MarkdownModal[\s\S]*?content=\{\w+\.content\}[\s\S]*?onclose=\{\w+\.close\}/);
	});

	test(`${path} has no untranslated modal text`, () => {
		assert.doesNotMatch(source, /'Loading\.\.\.'/);
		assert.doesNotMatch(source, /not available\.\*'/);
	});
}

test('an update with nothing to show is "no entries", anything else that fails is "not available"', () => {
	const helper = readFileSync(join(root, 'lib/utils/text-modal.svelte.ts'), 'utf8');
	assert.match(helper, /next\.kind === 'update' && notFound \? 'empty' : 'failed'/);
	assert.match(helper, /if \(id !== latest\) return;/);
	for (const key of ['UPDATE_CHANGELOG_EMPTY', 'UPDATE_CHANGELOG_FAILED', 'README_NOT_AVAILABLE', 'CHANGELOG_NOT_AVAILABLE', 'LOADING']) {
		assert.match(helper, new RegExp(`ADMIN_NEXT\\.${key}`));
	}
});
