import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	normalizeTaxonomyMap,
	parseTaxonomy,
	taxonomyOptions,
	taxonomyValues,
	withTaxonomyType
} from '../src/lib/utils/taxonomy.ts';

// The frontmatter from getgrav/grav-plugin-admin2#186: one type written as a
// single value, the other as a list.
const reported = { category: 'blog', tag: ['zeitgeistgedachtegang'] };

test('reads a single value, a comma list, a list and a bare number', () => {
	assert.deepEqual(parseTaxonomy(reported), { category: ['blog'], tag: ['zeitgeistgedachtegang'] });
	assert.deepEqual(taxonomyValues('news, blog ,'), ['news', 'blog']);
	assert.deepEqual(taxonomyValues(2024), ['2024']);
	assert.deepEqual(taxonomyValues([2024, 'a', null, { nested: true }]), ['2024', 'a']);
	assert.deepEqual(taxonomyValues(null), []);
	assert.deepEqual(parseTaxonomy(null), {});
	assert.deepEqual(parseTaxonomy(['not', 'a', 'map']), {});
});

test('number values from the API become strings, so sorting them cannot throw (#186)', () => {
	// What GET /taxonomy sends when pages carry year tags: PHP array keys that
	// look like integers come back as ints.
	const fromApi = { category: ['blog'], tag: ['zeitgeistgedachtegang', 2024, 2023, 'Nieuws'] };

	// The comparison the field ran on the raw reply.
	assert.throws(
		() => [...fromApi.tag].sort((a, b) => (a as string).localeCompare(b as string)),
		TypeError
	);

	const map = normalizeTaxonomyMap(fromApi);
	assert.deepEqual(map.tag, ['zeitgeistgedachtegang', '2024', '2023', 'Nieuws']);
	assert.deepEqual(
		taxonomyOptions(map.tag).map((o) => o.value),
		['2023', '2024', 'Nieuws', 'zeitgeistgedachtegang']
	);
	assert.ok(taxonomyOptions(map.tag).every((o) => typeof o.value === 'string' && o.label === o.value));
});

test('an unusable reply reads as no known values instead of throwing', () => {
	assert.deepEqual(normalizeTaxonomyMap([]), {}); // PHP's empty map
	assert.deepEqual(normalizeTaxonomyMap(null), {});
	assert.deepEqual(normalizeTaxonomyMap('<html>'), {});
	assert.deepEqual(normalizeTaxonomyMap({ tag: null, category: { 3: 'blog', 7: 'news' }, author: 'x' }), {
		tag: [],
		category: ['blog', 'news'],
		author: []
	});
	assert.deepEqual(normalizeTaxonomyMap({ tag: ['a', '', 'a', null] }), { tag: ['a'] });
});

test('editing one type leaves the others as the author wrote them', () => {
	const next = withTaxonomyType(reported, 'tag', ['zeitgeistgedachtegang', 'nieuw']);
	assert.deepEqual(next, { category: 'blog', tag: ['zeitgeistgedachtegang', 'nieuw'] });
	assert.equal(next.category, 'blog'); // still a single value, not ['blog']

	// Undoing the edit gives back the original value, so the editor sees no change.
	assert.deepEqual(withTaxonomyType(next, 'tag', ['zeitgeistgedachtegang']), reported);

	// A number written as a single value is kept too, instead of being emptied.
	assert.deepEqual(withTaxonomyType({ category: 2024, tag: ['a'] }, 'tag', []), { category: 2024, tag: [] });
});

test('a cleared type is sent as an empty list, and a first value starts the map', () => {
	assert.deepEqual(withTaxonomyType(reported, 'category', []), { category: [], tag: ['zeitgeistgedachtegang'] });
	assert.deepEqual(withTaxonomyType(undefined, 'tag', ['a']), { tag: ['a'] });
	assert.deepEqual(withTaxonomyType(reported, 'tag', 'not a list'), { category: 'blog', tag: [] });
});
