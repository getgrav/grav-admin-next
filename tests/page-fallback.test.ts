import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectivePageLang, pageFallbackState } from '../src/lib/utils/page-fallback.ts';

const site = { enabled: true, defaultLang: 'fr' };

test('a page returned in the active language is not a fallback', () => {
	const page = { language: 'en', untranslated_languages: [] };
	assert.equal(pageFallbackState({ ...site, activeLang: 'en', page }), 'none');
});

test('a single-language site and an unloaded page are never a fallback', () => {
	const page = { language: 'fr', untranslated_languages: ['en'] };
	assert.equal(pageFallbackState({ ...site, enabled: false, activeLang: 'en', page }), 'none');
	assert.equal(pageFallbackState({ ...site, activeLang: 'en', page: null }), 'none');
});

test('a missing translation the server lists can be created', () => {
	const page = { language: 'fr', untranslated_languages: ['en'] };
	assert.equal(pageFallbackState({ ...site, activeLang: 'en', page }), 'creatable');
});

test('a bare default.md counts as the default language', () => {
	const page = { language: null, untranslated_languages: ['en'] };
	assert.equal(effectivePageLang(page, 'fr'), 'fr');
	assert.equal(pageFallbackState({ ...site, activeLang: 'fr', page }), 'none');
	assert.equal(pageFallbackState({ ...site, activeLang: 'en', page }), 'creatable');
});

// getgrav/grav#4338: default.en.md and default.fr.md both exist, the editor asks
// for `?lang=en&translations=true`, and the web server drops the query string.
// The API answers with the default-language file and no translation fields.
test('the default-language file with no translation fields is unresolved', () => {
	const page = { language: 'fr' };
	assert.equal(pageFallbackState({ ...site, activeLang: 'en', page }), 'unresolved');
});

test('another language returned while the active one already has a file is unresolved', () => {
	const page = { language: 'fr', untranslated_languages: [] };
	assert.equal(pageFallbackState({ ...site, activeLang: 'en', page }), 'unresolved');
});
