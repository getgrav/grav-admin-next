import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLang } from '../src/lib/i18n/normalize.ts';

// An underscore code that isn't in the alias map came back untouched, and
// `pt_BR` is no BCP 47 tag: IntlMessageFormat refuses to compile any message
// for it, so t() shows the raw ICU text with its `{placeholders}`.
test('underscore codes are canonicalized like hyphenated ones', () => {
	assert.equal(normalizeLang('pt_BR'), 'pt-BR');
	assert.equal(normalizeLang('en_GB'), 'en-GB');
	assert.equal(normalizeLang('zh_hans'), 'zh-Hans');
	assert.equal(normalizeLang('fr_FR'), 'fr-FR');
	assert.equal(normalizeLang('pt-br'), 'pt-BR');
	assert.equal(normalizeLang('en'), 'en-US');
});
