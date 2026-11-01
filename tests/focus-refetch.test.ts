import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// getgrav/grav-plugin-admin2#206: coming back to the admin after more than 30s
// away emits `*:focus`, and the Plugins page refetched its list with the same
// `loading` flag that swaps the whole list and detail pane for a full-page
// spinner. It looked like the page had reloaded, and the list lost its scroll.
// A view that refetches on focus must keep what it already shows on screen:
// only its first load may put up the full-page spinner.

const root = new URL('../src/', import.meta.url).pathname;

function svelteFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return svelteFiles(path);
		return entry.name.endsWith('.svelte') ? [path] : [];
	});
}

const focusViews = svelteFiles(root).filter((file) => readFileSync(file, 'utf8').includes("subscribe('*:focus'"));

test('the views that refetch on focus are found', () => {
	const names = focusViews.map((file) => file.slice(root.length));
	assert.ok(names.includes('routes/plugins/+page.svelte'));
	assert.ok(names.includes('routes/users/groups/+page.svelte'));
});

for (const file of focusViews) {
	test(`${file.slice(root.length)} does not blank its content on a refetch`, () => {
		const source = readFileSync(file, 'utf8');
		// A bare `{#if loading}` whose branch is the full-page spinner.
		const blanking = /\{#if loading\}\s*<div class="flex flex-1 items-center justify-center">\s*<Loader2/;
		assert.doesNotMatch(source, blanking);
	});
}
