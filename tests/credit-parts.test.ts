import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creditParts } from '../src/lib/utils/credit-parts.ts';

// The sidebar credit: icons and the company link go wherever a translation
// puts their placeholders.

function translator(message: string) {
	return (_key: string, params: Record<string, string> = {}) =>
		message.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? `{${name}}`);
}

const SLOTS = ['code', 'love', 'company'];

test('the English sentence splits into text and slots in order', () => {
	assert.deepEqual(creditParts(translator('Grav was {code} with {love} by {company}.'), 'K', SLOTS), [
		{ text: 'Grav was ' },
		{ slot: 'code' },
		{ text: ' with ' },
		{ slot: 'love' },
		{ text: ' by ' },
		{ slot: 'company' },
		{ text: '.' },
	]);
});

test('a translation can reorder the placeholders', () => {
	const parts = creditParts(translator('{company} hat Grav mit {love} {code}'), 'K', SLOTS);
	assert.deepEqual(parts.filter((p) => p.slot).map((p) => p.slot), ['company', 'love', 'code']);
	assert.equal(parts[0].slot, 'company');
});

test('a translation without placeholders is plain text', () => {
	assert.deepEqual(creditParts(translator('Made By'), 'K', SLOTS), [{ text: 'Made By' }]);
});
