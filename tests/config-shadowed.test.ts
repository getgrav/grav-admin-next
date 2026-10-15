import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	changedLeafPaths,
	enabledSourceApplies,
	formatShadowValue,
	liveEnabledAfterToggle,
	readShadowed,
	shadowForField,
	shadowedHits,
	type ShadowedEntry,
} from '../src/lib/utils/config-shadowed.ts';

const env = (path: string, value: unknown = 'x'): ShadowedEntry => ({
	path,
	source: 'environment',
	environment: 'example.com',
	file: 'user/env/example.com/config/plugins/sync-mercure.yaml',
	value,
});
const server = (path: string, value: unknown = '********'): ShadowedEntry => ({
	path,
	source: 'server',
	environment: null,
	file: null,
	value,
});

test('meta.shadowed reads as a list, defaulting to empty and dropping malformed rows', () => {
	assert.deepEqual(readShadowed(undefined), []);
	assert.deepEqual(readShadowed({}), []);
	assert.deepEqual(readShadowed({ shadowed: 'nope' }), []);
	const list = readShadowed({
		shadowed: [
			{ path: 'enabled', source: 'environment', environment: 'example.com', file: 'user/env/example.com/config/plugins/x.yaml', value: false },
			{ path: 'smtp.password', source: 'server', environment: null, file: null, value: '********' },
			{ path: 'bad', source: 'elsewhere' },
			{ source: 'server' },
			null,
		],
	});
	assert.equal(list.length, 2);
	assert.deepEqual(list[0], { path: 'enabled', source: 'environment', environment: 'example.com', file: 'user/env/example.com/config/plugins/x.yaml', value: false });
	assert.deepEqual(list[1], { path: 'smtp.password', source: 'server', environment: null, file: null, value: '********' });
});

test('changed paths are dotted leaves; lists compare as one value', () => {
	const before = { enabled: true, smtp: { host: 'a', port: 25 }, list: [1, 2], gone: 'x' };
	const after = { enabled: false, smtp: { host: 'a', port: 587 }, list: [1, 2], added: { deep: 1 } };
	assert.deepEqual(changedLeafPaths(before, after).sort(), ['added.deep', 'enabled', 'gone', 'smtp.port']);
	assert.deepEqual(changedLeafPaths({ list: [1, 2] }, { list: [2, 1] }), ['list']);
	assert.deepEqual(changedLeafPaths({ a: 1 }, { a: 1 }), []);
});

test('a save runs into a shadowed key when it changed that key, a parent of it, or a child of it', () => {
	const shadowed = [env('enabled', false), env('smtp.host'), server('routes')];
	assert.deepEqual(shadowedHits(['enabled'], shadowed).map((e) => e.path), ['enabled']);
	assert.deepEqual(shadowedHits(['smtp'], shadowed).map((e) => e.path), ['smtp.host']);
	assert.deepEqual(shadowedHits(['routes.0'], shadowed).map((e) => e.path), ['routes']);
	assert.deepEqual(shadowedHits(['smtp.port', 'name'], shadowed), []);
	// A prefix that is not a path segment does not count.
	assert.deepEqual(shadowedHits(['enabled_extra'], shadowed), []);
	assert.deepEqual(shadowedHits([], shadowed), []);
});

test('a field is marked by its own entry first, else by one nested under it (server first)', () => {
	const shadowed = [env('smtp.host', 'h'), server('smtp.password'), env('enabled', false)];
	assert.deepEqual(shadowForField('enabled', shadowed), { entry: shadowed[2], exact: true });
	assert.deepEqual(shadowForField('smtp', shadowed), { entry: shadowed[1], exact: false });
	assert.equal(shadowForField('smtp.port', shadowed), null);
	assert.equal(shadowForField('', shadowed), null);
	assert.equal(shadowForField('enabled', []), null);
});

test("an environment's enabled_source only marks the toggle while saving to Default; a server variable always does", () => {
	const fromEnv = { source: 'environment' as const, environment: 'example.com', file: 'user/env/example.com/config/plugins/x.yaml' };
	const fromServer = { source: 'server' as const, environment: null, file: null };
	assert.equal(enabledSourceApplies(fromEnv, ''), true);
	assert.equal(enabledSourceApplies(fromEnv, 'example.com'), false);
	assert.equal(enabledSourceApplies(fromEnv, 'staging.test'), false);
	assert.equal(enabledSourceApplies(fromServer, 'example.com'), true);
	assert.equal(enabledSourceApplies(null, ''), false);
	assert.equal(enabledSourceApplies(undefined, ''), false);
});

test('shadowed values display as on/off, empty, JSON or text', () => {
	const labels = { on: 'on', off: 'off', empty: 'empty' };
	assert.equal(formatShadowValue(true, labels), 'on');
	assert.equal(formatShadowValue(false, labels), 'off');
	assert.equal(formatShadowValue('', labels), 'empty');
	assert.equal(formatShadowValue(null, labels), 'empty');
	assert.equal(formatShadowValue({ a: 1 }, labels), '{"a":1}');
	assert.equal(formatShadowValue(587, labels), '587');
	assert.equal(formatShadowValue('********', labels), '********');
});

test('after a toggle the plugin shows the state the site uses, not the value just saved', () => {
	assert.equal(liveEnabledAfterToggle(true, []), true);
	assert.equal(liveEnabledAfterToggle(false, [env('depth', 3)]), false);
	assert.equal(liveEnabledAfterToggle(true, [env('enabled', false)]), false);
	assert.equal(liveEnabledAfterToggle(false, [server('enabled', true)]), true);
	assert.equal(liveEnabledAfterToggle(true, [env('enabled', 'false')]), false);
});
