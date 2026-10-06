import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uploadAcceptTypes } from '../src/lib/utils/media-accept.ts';

// getgrav/grav-plugin-admin2#192: a `type: file` field written for admin-classic
// with `accept: ['*']` rejected every file, because Uppy reads each entry as a
// mime type or `.ext` and a lone star is neither.

test('a catch-all accept list leaves the upload unrestricted', () => {
	assert.equal(uploadAcceptTypes(['*']), undefined);
	assert.equal(uploadAcceptTypes(['*/*']), undefined);
	assert.equal(uploadAcceptTypes(['.*']), undefined);
	assert.equal(uploadAcceptTypes([' * ']), undefined);
	assert.equal(uploadAcceptTypes(['.pdf', '*']), undefined);
});

test('an absent or empty accept list leaves the upload unrestricted', () => {
	assert.equal(uploadAcceptTypes(undefined), undefined);
	assert.equal(uploadAcceptTypes([]), undefined);
	assert.equal(uploadAcceptTypes(['', ' ']), undefined);
});

test('real mime types and extensions are kept, trimmed', () => {
	assert.deepEqual(uploadAcceptTypes(['image/*', ' .pdf ', 'application/zip']), ['image/*', '.pdf', 'application/zip']);
});

test('Uppy takes a catch-all field once it is dropped, and refuses it raw', async () => {
	const { Uppy } = await import('@uppy/core');
	const file = { name: 'notes.txt', type: 'text/plain', data: new Blob(['hi']), source: 'test' };

	const raw = new Uppy({ restrictions: { allowedFileTypes: ['*'] } });
	assert.throws(() => raw.addFile(file), /You can only upload/);

	const fixed = new Uppy({ restrictions: { allowedFileTypes: uploadAcceptTypes(['*']) } });
	assert.doesNotThrow(() => fixed.addFile(file));

	const typed = new Uppy({ restrictions: { allowedFileTypes: uploadAcceptTypes(['.pdf', 'image/*']) } });
	assert.throws(() => typed.addFile(file), /You can only upload/);
});
