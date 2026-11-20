import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { InvalidationEvent } from '../src/lib/api/types.ts';

// getgrav/grav-plugin-admin2#220: deleting a page media file answered with
// `pages:update:/<route>`, and the page editor took its own delete for an edit
// made elsewhere. With no unsaved edits it reloaded the page: the form was
// swapped for "Loading page…", <main> collapsed to the viewport height, and the
// view came back at the top. With unsaved edits it toasted "Page changed
// elsewhere". Uploads, pastes and metadata saves answer with the same event.
// A media write made from the editor must not reach that handler.

const root = new URL('../src/', import.meta.url).pathname;
const editorFile = 'routes/pages/edit/[...route]/+page.svelte';

function sourceFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const file = join(dir, entry.name);
		if (entry.isDirectory()) return sourceFiles(file);
		return /\.(svelte|ts)$/.test(entry.name) ? [file] : [];
	});
}

const sources = sourceFiles(root)
	.filter((file) => !file.endsWith('lib/api/endpoints/media.ts'))
	.map((file) => ({ name: file.slice(root.length), text: readFileSync(file, 'utf8') }));

test("the page editor skips the echo of its own media writes", () => {
	const editor = sources.find((s) => s.name === editorFile);
	assert.ok(editor);
	const subscription = editor.text.match(/subscribe\('pages:update'[\s\S]*?dirtyGuard:([^\n]*)/);
	assert.ok(subscription, 'pages:update subscription with a dirtyGuard');
	assert.match(subscription[1], /isPageMediaWriting\(\)/);
});

const writes = ['deletePageMedia', 'uploadPageMedia', 'savePageMediaMeta', 'batchSavePageMediaMeta'];

for (const write of writes) {
	test(`every ${write}() call is marked as our own write`, () => {
		const calls = sources.flatMap(({ name, text }) =>
			text.split('\n').flatMap((line, i) => (line.includes(`${write}(`) ? [{ name, line: i + 1, text: line }] : []))
		);
		assert.ok(calls.length > 0, `${write} is called somewhere`);
		for (const call of calls) {
			assert.match(call.text, /pageMediaWrite\(/, `${call.name}:${call.line}: ${call.text.trim()}`);
		}
	});
}

test('hand-made page media tags come from pageMediaTags and are marked too', () => {
	for (const { name, text } of sources) {
		if (name === 'lib/utils/page-media-writes.ts') continue;
		assert.doesNotMatch(text, /`pages:update:\/\$\{/, `${name} builds a pages:update tag by hand`);
		for (const line of text.split('\n').filter((l) => l.includes('pageMediaTags('))) {
			if (/^\s*return pageMediaTags\(/.test(line)) continue; // PageMedia's getInvalidationKeys()
			assert.match(line, /pageMediaWrite\(/, `${name}: ${line.trim()}`);
		}
	}
});

test('pageMediaTags gives the tags the API sends, with or without a leading slash', async () => {
	const { pageMediaTags } = await import('../src/lib/utils/page-media-writes.ts');
	const expected = ['media:update:pages/blog/post', 'pages:update:/blog/post'];
	assert.deepEqual(pageMediaTags('/blog/post'), expected);
	assert.deepEqual(pageMediaTags('blog/post'), expected);
});

test('an echo emitted during our own write is skipped; one from elsewhere is not', async () => {
	const { pageMediaWrite, isPageMediaWriting } = await import('../src/lib/utils/page-media-writes.ts');
	const { invalidations } = await import('../src/lib/stores/invalidation.svelte.ts');
	const route = '/blog/post';
	const seen: string[] = [];
	const unsub = invalidations.subscribe('pages:update', (e: InvalidationEvent) => {
		if (e.id === route) seen.push(e.tag);
	}, { dirtyGuard: () => isPageMediaWriting() });

	// The API client emits X-Invalidates before the request's promise resolves.
	const fakeDelete = () =>
		new Promise<void>((resolve) => setTimeout(() => {
			invalidations.emit(['media:update:pages/blog/post', 'pages:update:/blog/post']);
			resolve();
		}, 1));
	await pageMediaWrite(fakeDelete);
	// Uppy's hand-made emit is synchronous.
	await pageMediaWrite(() => invalidations.emit('pages:update:/blog/post'));
	assert.deepEqual(seen, []);
	assert.equal(isPageMediaWriting(), false);

	// A failed write still clears the mark.
	await assert.rejects(pageMediaWrite(() => Promise.reject(new Error('403'))));
	assert.equal(isPageMediaWriting(), false);

	// Another tab saved the page: the editor still hears about it.
	invalidations.emit('pages:update:/blog/post');
	assert.deepEqual(seen, ['pages:update:/blog/post']);
	unsub();
});
