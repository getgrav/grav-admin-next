import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPluginApi, type PluginApi } from '../src/lib/utils/plugin-api.ts';

// getgrav/grav-plugin-admin2#197: plugin code gets Admin2's API client as
// window.__GRAV_API, so a plugin endpoint's X-Invalidates reaches the screen.

function fakeClient() {
	const calls: unknown[][] = [];
	const record = (method: string) => async (...args: unknown[]) => {
		calls.push([method, ...args]);
		return { ok: method };
	};
	const client = {
		get: record('get'),
		post: record('post'),
		patch: record('patch'),
		put: record('put'),
		delete: record('delete'),
		requestRaw: record('requestRaw'),
		retryPending: record('retryPending'),
		clearShortCache: record('clearShortCache'),
	};
	return { client: client as unknown as PluginApi, calls };
}

test('every method goes through the client with its arguments untouched', async () => {
	const { client, calls } = fakeClient();
	const bridge = createPluginApi(client);

	assert.deepEqual(await bridge.get('/stock/42', { lang: 'en' }), { ok: 'get' });
	await bridge.post('/stock/42/add', { qty: 3 });
	await bridge.patch('/stock/42', { qty: 5 });
	await bridge.put('/stock/42', { qty: 6 });
	await bridge.delete('/stock/42');

	assert.deepEqual(calls, [
		['get', '/stock/42', { lang: 'en' }],
		['post', '/stock/42/add', { qty: 3 }],
		['patch', '/stock/42', { qty: 5 }],
		['put', '/stock/42', { qty: 6 }],
		['delete', '/stock/42', undefined],
	]);
});

test('only the five request methods are handed to plugins', () => {
	const { client } = fakeClient();
	assert.deepEqual(Object.keys(createPluginApi(client)).sort(), ['delete', 'get', 'patch', 'post', 'put']);
});

test('a failed call rejects with the client error, status included', async () => {
	const err = Object.assign(new Error('Stock record not found'), { status: 404 });
	const client = { get: async () => { throw err; } } as unknown as PluginApi;
	await assert.rejects(createPluginApi(client).get('/stock/missing'), (e: unknown) => e === err);
});
