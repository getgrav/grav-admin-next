import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toggleFolder, type FolderToggleDeps } from '../src/lib/utils/tree-expand.ts';

/** An open-folder store plus a load whose result the test settles by hand. */
function harness(initial: string[] = ['/']) {
	let open = new Set(initial);
	const published: string[][] = [];
	const loads: { route: string; settle: (ok: boolean) => void }[] = [];
	const deps: FolderToggleDeps = {
		expanded: () => open,
		setExpanded: (next) => {
			open = next;
			published.push([...next]);
		},
		load: (route) => new Promise<boolean>((resolve) => loads.push({ route, settle: resolve })),
	};
	return { deps, loads, published, isOpen: (r: string) => open.has(r) };
}

test('a folder opens before its first chunk arrives (admin2#200)', async () => {
	const h = harness();
	const done = toggleFolder('/books', h.deps);

	assert.equal(h.isOpen('/books'), true, 'open while the request is still out');
	assert.equal(h.loads.length, 1);
	assert.equal(h.loads[0].route, '/books');

	h.loads[0].settle(true);
	assert.equal(await done, 'loaded');
	assert.equal(h.isOpen('/books'), true);
	assert.equal(h.published.length, 1, 'opening publishes once, not again after the load');
});

test('a failed first chunk leaves the folder open and reports the failure', async () => {
	const h = harness();
	const done = toggleFolder('/books', h.deps);
	h.loads[0].settle(false);
	assert.equal(await done, 'failed');
	assert.equal(h.isOpen('/books'), true, 'stays open so the retry is where the rows would be');
});

test('closing a folder while its chunk loads keeps it closed', async () => {
	const h = harness();
	const opening = toggleFolder('/books', h.deps);
	assert.equal(await toggleFolder('/books', h.deps), 'closed');
	assert.equal(h.isOpen('/books'), false);

	h.loads[0].settle(true);
	assert.equal(await opening, 'closed-while-loading');
	assert.equal(h.isOpen('/books'), false, 'the late load does not reopen it');
});

test('another folder opened during the load is not dropped when the load settles', async () => {
	const h = harness();
	const first = toggleFolder('/books', h.deps);
	const second = toggleFolder('/blog', h.deps);
	h.loads[1].settle(true);
	h.loads[0].settle(true);
	await Promise.all([first, second]);
	assert.equal(h.isOpen('/books'), true);
	assert.equal(h.isOpen('/blog'), true);
});

test('closing an open folder does not load anything', async () => {
	const h = harness(['/', '/books']);
	assert.equal(await toggleFolder('/books', h.deps), 'closed');
	assert.equal(h.loads.length, 0);
	assert.equal(h.isOpen('/'), true, 'other folders stay as they were');
});
