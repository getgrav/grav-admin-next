import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mdDestination, mediaDestination } from '../src/lib/utils/md-destination.ts';

// The media panel copied `[x](<media://docs/Invoice #12.pdf>)`: the angle brackets
// make the space legal, but the `#` still starts a fragment, so the link pointed at
// `Invoice ` (getgrav/grav#4388, grav-admin-next#48).

test('a space is wrapped in angle brackets, as before', () => {
	assert.equal(
		mediaDestination('media://test/example document.pdf'),
		'<media://test/example document.pdf>'
	);
	assert.equal(mediaDestination('example document.pdf'), '<example document.pdf>');
	assert.equal(mediaDestination('photo.jpg'), 'photo.jpg');
});

test('characters a URL reads as syntax are percent-encoded', () => {
	assert.equal(
		mediaDestination('media://docs/Invoice #12.pdf'),
		'<media://docs/Invoice %2312.pdf>'
	);
	assert.equal(mediaDestination('a?b.pdf'), 'a%3Fb.pdf');
	assert.equal(mediaDestination('100% done.pdf'), '<100%25 done.pdf>');
	assert.equal(mediaDestination('100%20x.pdf'), '100%2520x.pdf');
	assert.equal(mediaDestination('a<b>.pdf'), 'a%3Cb%3E.pdf');
});

test('everything else is left as written', () => {
	assert.equal(mediaDestination('file (1).pdf'), '<file (1).pdf>');
	assert.equal(mediaDestination('café.jpg'), 'café.jpg');
	assert.equal(
		mediaDestination('media://photos/2026/hero+1.jpg'),
		'media://photos/2026/hero+1.jpg'
	);
});

test('mdDestination still leaves a typed URL alone', () => {
	assert.equal(
		mdDestination('https://example.com/a.jpg?w=100#x'),
		'https://example.com/a.jpg?w=100#x'
	);
	assert.equal(mdDestination('<already wrapped.jpg>'), '<already wrapped.jpg>');
});
