import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	effectiveRule,
	flattenAccessRules,
	serializeAccessRules,
	setAccessRule
} from '../src/lib/utils/access-rules.ts';

// A slice of the permissions blueprint: the children the editor knows about.
const tree: Record<string, string[]> = {
	api: ['api.access', 'api.super', 'api.system', 'api.users'],
	'api.system': ['api.system.info', 'api.system.backup'],
	'api.users': ['api.users.read', 'api.users.write']
};
const childNames = (name: string) => tree[name] ?? [];

/** What the server returns and what saving an unchanged map sends back. */
const roundTrip = (access: unknown) => serializeAccessRules(flattenAccessRules(access));

test('a top-level dotted key reads like its nested equivalent', () => {
	const fromCore = { api: { access: true, system: true }, 'api.system.backup': false };
	assert.deepEqual(flattenAccessRules(fromCore), {
		'api.access': true,
		'api.system': true,
		'api.system.backup': false
	});
	assert.deepEqual(
		flattenAccessRules({ api: { system: { backup: false } } }),
		flattenAccessRules({ 'api.system.backup': false })
	);
});

test('the row for an overriding rule shows its own state, and the effective value follows core', () => {
	const rules = flattenAccessRules({ api: { system: true }, 'api.system.backup': false });
	assert.equal(rules['api.system.backup'], false);
	assert.equal(effectiveRule(rules, 'api.system.backup'), false);
	assert.equal(effectiveRule(rules, 'api.system.backup.download'), false);
	assert.equal(effectiveRule(rules, 'api.system.info'), true);
	assert.equal(effectiveRule(rules, 'api.pages'), undefined);
});

test('saving an unchanged map gives back what core sent (Access::toArray cases)', () => {
	const cases = [
		{ admin: { login: true, pages: { read: true, delete: false } } },
		{ api: { access: true, system: true }, 'api.system.backup': false },
		{ api: { system: true }, 'api.system.backup': false },
		{ admin: false, 'admin.pages.read': true },
		{ api: true, 'api.users': false, 'api.users.read': true },
		{ api: { system: true } }
	];
	for (const access of cases) {
		assert.deepEqual(roundTrip(access), access);
		assert.equal(JSON.stringify(roundTrip(access)), JSON.stringify(access));
	}
});

test('a child listed before its parent still saves as a dotted key', () => {
	assert.deepEqual(roundTrip({ 'api.system.backup': false, api: { system: true } }), {
		api: { system: true },
		'api.system.backup': false
	});
});

test('an empty map from the API (`[]`) reads as no rules', () => {
	assert.deepEqual(flattenAccessRules([]), {});
	assert.deepEqual(flattenAccessRules({ api: [] }), {});
	assert.deepEqual(flattenAccessRules(null), {});
	assert.deepEqual(setAccessRule(flattenAccessRules([]), 'api.access', 'allowed', childNames), {
		'api.access': true
	});
});

test('toggling an overriding rule changes it in place and leaves the parent alone', () => {
	const rules = flattenAccessRules({ api: { system: true }, 'api.system.backup': false });
	const allowed = setAccessRule(rules, 'api.system.backup', 'allowed', childNames);
	assert.deepEqual(serializeAccessRules(allowed), {
		api: { system: true },
		'api.system.backup': true
	});
	assert.equal(effectiveRule(allowed, 'api.system.info'), true);
	assert.equal(effectiveRule(allowed, 'api.system.backup'), true);

	const denied = setAccessRule(allowed, 'api.system.backup', 'denied', childNames);
	assert.equal(
		JSON.stringify(serializeAccessRules(denied)),
		JSON.stringify({ api: { system: true }, 'api.system.backup': false })
	);
});

test('clearing an overriding rule removes the dotted key and nothing else', () => {
	const rules = flattenAccessRules({ api: { system: true }, 'api.system.backup': false });
	assert.deepEqual(
		serializeAccessRules(setAccessRule(rules, 'api.system.backup', 'unset', childNames)),
		{
			api: { system: true }
		}
	);
});

test('clearing a permission without a rule of its own leaves the map alone', () => {
	const access = { api: { system: true } };
	const rules = flattenAccessRules(access);
	assert.deepEqual(
		serializeAccessRules(setAccessRule(rules, 'api.system.backup', 'unset', childNames)),
		access
	);
});

test('setting a rule and clearing it again gives back the same map', () => {
	const access = { api: { system: true }, 'api.system.backup': false };
	const rules = flattenAccessRules(access);
	const set = setAccessRule(rules, 'api.users.read', 'allowed', childNames);
	const cleared = setAccessRule(set, 'api.users.read', 'unset', childNames);
	assert.equal(JSON.stringify(serializeAccessRules(cleared)), JSON.stringify(access));
});

test('setting a parent keeps the rule below it as a dotted key', () => {
	const rules = flattenAccessRules({ api: { system: { backup: false } } });
	const next = setAccessRule(rules, 'api.system', 'allowed', childNames);
	assert.deepEqual(serializeAccessRules(next), {
		api: { system: true },
		'api.system.backup': false
	});
	assert.equal(effectiveRule(next, 'api.system.backup'), false);
});

test('a child rule that repeats its parent is kept', () => {
	const rules = flattenAccessRules({ api: { system: { backup: false } } });
	const next = setAccessRule(rules, 'api.system', 'denied', childNames);
	assert.deepEqual(serializeAccessRules(next), {
		api: { system: false },
		'api.system.backup': false
	});
});

test('a new rule below a plain allow spreads it onto the known children (admin2#50)', () => {
	const rules = flattenAccessRules({ api: { users: true } });
	const next = setAccessRule(rules, 'api.users.write', 'denied', childNames);
	assert.deepEqual(serializeAccessRules(next), { api: { users: { read: true, write: false } } });
});

test('spreading a plain allow keeps the children that have rules of their own', () => {
	const rules = flattenAccessRules({ api: { system: true }, 'api.system.backup': false });
	const next = setAccessRule(rules, 'api.system.info', 'denied', childNames);
	assert.deepEqual(serializeAccessRules(next), { api: { system: { backup: false, info: false } } });
});

test('spreading through two levels keeps a deeper override', () => {
	const rules = flattenAccessRules({ api: true, 'api.users': false, 'api.users.read': true });
	const next = setAccessRule(rules, 'api.system.backup', 'denied', childNames);
	assert.equal(effectiveRule(next, 'api.users.read'), true);
	assert.equal(effectiveRule(next, 'api.users.write'), false);
	assert.equal(effectiveRule(next, 'api.system.info'), true);
	assert.equal(effectiveRule(next, 'api.system.backup'), false);
	assert.equal(effectiveRule(next, 'api.access'), true);
	assert.deepEqual(serializeAccessRules(next), {
		api: { users: false, access: true, super: true, system: { info: true, backup: false } },
		'api.users.read': true
	});
});

test('values that are not plain booleans are kept as they are', () => {
	const access = { admin: { pages: 'crud' }, site: { login: 1 } };
	assert.deepEqual(roundTrip(access), access);
});

test('keys that would write to the prototype are left out', () => {
	const access = JSON.parse('{"__proto__": {"polluted": true}, "api": {"access": true}}');
	const out = roundTrip(access);
	assert.deepEqual(out, { api: { access: true } });
	assert.equal(({} as Record<string, unknown>).polluted, undefined);
});
