import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withFolderSettings } from '../src/lib/utils/room-snapshot.ts';

// The page on disk after a reorder moved `12.fifth` to `05.fifth`.
const loaded = { header: { title: 'fifth' }, content: 'body', folder: 'fifth', name: 'default', route: '/blog', ordering: true, order: '05.' };

test('a room seeded before a reorder does not bring the old prefix back (grav#4361)', () => {
	const room = { ...loaded, order: '12.' };
	const merged = withFolderSettings(room, loaded);
	assert.equal(merged.order, '05.');
	assert.deepEqual(merged, loaded);
});

test('folder, parent and the prefix toggle come from the loaded page too', () => {
	const room = { ...loaded, folder: 'old-name', route: '/old-parent', ordering: false, order: false };
	const merged = withFolderSettings(room, loaded);
	assert.equal(merged.folder, 'fifth');
	assert.equal(merged.route, '/blog');
	assert.equal(merged.ordering, true);
	assert.equal(merged.order, '05.');
});

test('content, header and template still come from the room', () => {
	const room = { ...loaded, content: 'peer edit', header: { title: 'Peer title' }, name: 'item' };
	const merged = withFolderSettings(room, loaded);
	assert.equal(merged.content, 'peer edit');
	assert.deepEqual(merged.header, { title: 'Peer title' });
	assert.equal(merged.name, 'item');
});
