import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pasteImageFilename, pasteImageExtension, randomToken } from '../src/lib/utils/paste-image-name.ts';

// getgrav/grav-premium-issues#628: an image pasted or dropped into a page editor
// is uploaded to the page's media under a name chosen here, and the editor
// inserts a reference to that name. Before this, the markdown editor inserted
// `![image.png](image.png)` without uploading anything, and Editor Pro put the
// whole image into the page as a base64 `data:` URL.

/** A token source that hands out the given tokens in order. */
function tokens(...list: string[]) {
	let i = 0;
	return () => list[i++] ?? `zzzzzz${String(i).padStart(2, '0')}`;
}

test('a clipboard screenshot gets image-<8 random chars> with the extension of its type', () => {
	const name = pasteImageFilename({ name: 'image.png', type: 'image/png' }, []);
	assert.match(name ?? '', /^image-[a-z0-9]{8}\.png$/);
});

test('every browser stand-in name counts as no name at all', () => {
	for (const stand of ['image.png', 'Image.PNG', '', 'blob', 'image']) {
		assert.equal(
			pasteImageFilename({ name: stand, type: 'image/png' }, [], tokens('abcd1234')),
			'image-abcd1234.png',
			`stand-in name "${stand}"`,
		);
	}
});

test('the extension of a generated name comes from the MIME type', () => {
	const cases: Array<[string, string]> = [
		['image/png', 'png'],
		['image/jpeg', 'jpg'],
		['image/gif', 'gif'],
		['image/webp', 'webp'],
		['image/avif', 'avif'],
		['image/svg+xml', 'svg'],
	];
	for (const [type, ext] of cases) {
		assert.equal(pasteImageFilename({ name: 'image.png', type }, [], tokens('k3y4b2c1')), `image-k3y4b2c1.${ext}`);
		assert.equal(pasteImageExtension(type), ext);
	}
	assert.equal(pasteImageExtension('IMAGE/PNG'), 'png');
});

test('image types outside the supported list are refused', () => {
	for (const type of ['image/tiff', 'image/bmp', 'image/heic', 'application/pdf', 'text/plain']) {
		assert.equal(pasteImageFilename({ name: 'scan.tif', type }, []), null, type);
		assert.equal(pasteImageExtension(type), null, type);
	}
});

test('a dropped file with a real name keeps it, sanitized', () => {
	assert.equal(pasteImageFilename({ name: 'sunset.jpg', type: 'image/jpeg' }, []), 'sunset.jpg');
	assert.equal(pasteImageFilename({ name: 'Holiday Photo.JPG', type: 'image/jpeg' }, []), 'Holiday-Photo.jpg');
	assert.equal(pasteImageFilename({ name: 'my  photo (1).png', type: 'image/png' }, []), 'my-photo-1.png');
	assert.equal(pasteImageFilename({ name: 'Café menü.webp', type: 'image/webp' }, []), 'Café-menü.webp');
	assert.equal(pasteImageFilename({ name: 'logo.jpeg', type: 'image/jpeg' }, []), 'logo.jpeg');
});

test('a real name without an image extension gets one from the MIME type', () => {
	assert.equal(pasteImageFilename({ name: 'scan', type: 'image/png' }, []), 'scan.png');
	assert.equal(
		pasteImageFilename({ name: 'Screen Shot 2026-10-19 at 10.15.22', type: 'image/png' }, []),
		'Screen-Shot-2026-10-19-at-10.15.22.png',
	);
});

test('a file the OS gave no type is judged by its extension', () => {
	assert.equal(pasteImageFilename({ name: 'diagram.svg', type: '' }, []), 'diagram.svg');
	assert.equal(pasteImageFilename({ name: 'notes.txt', type: '' }, []), null);
	assert.equal(pasteImageFilename({ name: 'image.gif', type: '' }, [], tokens('aaaabbbb')), 'image-aaaabbbb.gif');
});

test('paths, leading dots and dot runs are stripped from a real name', () => {
	assert.equal(pasteImageFilename({ name: 'C:\\fakepath\\a.png', type: 'image/png' }, []), 'a.png');
	assert.equal(pasteImageFilename({ name: '../../evil.png', type: 'image/png' }, []), 'evil.png');
	assert.equal(pasteImageFilename({ name: '.hidden.png', type: 'image/png' }, []), 'hidden.png');
	assert.equal(pasteImageFilename({ name: 'a..b.png', type: 'image/png' }, []), 'a.b.png');
	assert.equal(pasteImageFilename({ name: '%%%.png', type: 'image/png' }, [], tokens('n0n4m3zz')), 'image-n0n4m3zz.png');
});

test('a real name already in the page media gets -<8 random chars> before the extension', () => {
	assert.equal(
		pasteImageFilename({ name: 'sunset.jpg', type: 'image/jpeg' }, ['sunset.jpg', 'other.png'], tokens('q1w2e3r4')),
		'sunset-q1w2e3r4.jpg',
	);
	// Filesystems that ignore case (macOS, Windows) would still overwrite.
	assert.equal(
		pasteImageFilename({ name: 'sunset.jpg', type: 'image/jpeg' }, ['SUNSET.JPG'], tokens('q1w2e3r4')),
		'sunset-q1w2e3r4.jpg',
	);
	assert.match(pasteImageFilename({ name: 'sunset.jpg', type: 'image/jpeg' }, ['sunset.jpg']) ?? '', /^sunset-[a-z0-9]{8}\.jpg$/);
});

test('a token that collides too is drawn again, never overwriting', () => {
	assert.equal(
		pasteImageFilename({ name: 'image.png', type: 'image/png' }, ['image-aaaaaaaa.png'], tokens('aaaaaaaa', 'bbbbbbbb')),
		'image-bbbbbbbb.png',
	);
	assert.equal(
		pasteImageFilename({ name: 'a.png', type: 'image/png' }, ['a.png', 'a-aaaaaaaa.png'], tokens('aaaaaaaa', 'cccccccc')),
		'a-cccccccc.png',
	);
});

test('repeated pastes against a growing media list never repeat a name', () => {
	const taken = new Set<string>();
	for (let i = 0; i < 500; i++) {
		const name = pasteImageFilename({ name: 'image.png', type: 'image/png' }, taken);
		assert.ok(name && !taken.has(name), `paste ${i} produced ${name}`);
		taken.add(name);
	}
	assert.equal(taken.size, 500);
});

test('random tokens are 8 lowercase letters or digits', () => {
	const seen = new Set<string>();
	for (let i = 0; i < 200; i++) {
		const t = randomToken();
		assert.match(t, /^[a-z0-9]{8}$/);
		seen.add(t);
	}
	assert.equal(seen.size, 200);
	assert.match(randomToken(12), /^[a-z0-9]{12}$/);
});
