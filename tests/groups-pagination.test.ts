import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// getgrav/grav-admin-next#45: GET /groups is paginated (20 per page by
// default), but the Groups list never drew a pager and filtered its search
// over the first page in the browser, so a site with more than 20 groups could
// neither see nor find the rest. Views that need every group (pickers, the
// permission-inheritance overlay) asked for one big page instead, which still
// stops at the API's max_per_page.
//
// Run: node --test tests/groups-pagination.test.ts

const root = new URL('../src/', import.meta.url).pathname;
const groupsPage = readFileSync(join(root, 'routes/users/groups/+page.svelte'), 'utf8');

test('the Groups list draws a pager when there is more than one page', () => {
	assert.match(groupsPage, /data\.totalPages > 1/);
	assert.match(groupsPage, /ADMIN_NEXT\.PAGINATION\.PAGE_OF/);
	assert.match(groupsPage, /loadGroups\(currentPage \+ 1\)/);
	assert.match(groupsPage, /loadGroups\(currentPage - 1\)/);
});

test('the pager is drawn under both the cards and the table view', () => {
	const renders = groupsPage.match(/\{@render pager\(\)\}/g) ?? [];
	assert.equal(renders.length, 2);
});

test('the Groups search runs on the server, not over the loaded page', () => {
	assert.match(groupsPage, /getGroups\(page, perPage, search\.trim\(\) \|\| undefined\)/);
	assert.doesNotMatch(groupsPage, /\.filter\(\s*\(g\)\s*=>/);
});

function svelteFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return svelteFiles(path);
		return entry.name.endsWith('.svelte') ? [path] : [];
	});
}

test('views that need every group use getAllGroups(), not one big page', () => {
	const onePage = svelteFiles(root)
		.filter((file) => /getGroups\(1,\s*\d+\)/.test(readFileSync(file, 'utf8')))
		.map((file) => file.slice(root.length));
	assert.deepEqual(onePage, []);
});

test('getAllGroups() follows total_pages', () => {
	const endpoint = readFileSync(join(root, 'lib/api/endpoints/groups.ts'), 'utf8');
	assert.match(endpoint, /export async function getAllGroups\(\)/);
	assert.match(endpoint, /first\.totalPages/);
});
