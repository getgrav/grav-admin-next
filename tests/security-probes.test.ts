import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSecuritySentinels } from '../src/lib/api/security-probes.ts';

const probes = ['dat', 'txt', 'zip'].map((extension) => ({
	url: `https://example.com/backup/probe.${extension}`,
	token: 'test-token',
	available: true,
	location: 'backup',
	extension
}));

const mockFetch =
	(responses: Record<string, Response | Error>): typeof fetch =>
	async (input, options) => {
		assert.equal(options?.credentials, 'omit');
		assert.equal(options?.cache, 'no-store');
		assert.ok(options?.signal);
		const response = responses[String(input).split('.').pop()!];
		if (response instanceof Error) throw response;
		return response;
	};

test('detects a proxy exposing txt and zip while blocking dat', async () => {
	const result = await checkSecuritySentinels(
		probes,
		mockFetch({
			dat: new Response('', { status: 403 }),
			txt: new Response('test-token'),
			zip: new Response('test-token')
		})
	);
	assert.deepEqual(result, { exposed: true, exposedFiles: ['backup/*.txt', 'backup/*.zip'] });
});

test('only successful blocking of every available probe reports false', async () => {
	assert.equal(
		(
			await checkSecuritySentinels(
				probes,
				mockFetch({
					dat: new Response('', { status: 403 }),
					txt: new Response('', { status: 404 }),
					zip: new Response('', { status: 403 })
				})
			)
		).exposed,
		false
	);
});

test('server errors, unrelated HTML and network failures remain unknown', async () => {
	assert.equal(
		(
			await checkSecuritySentinels(
				probes,
				mockFetch({
					dat: new Response('', { status: 500 }),
					txt: new Response('<html>login</html>'),
					zip: new Error('network')
				})
			)
		).exposed,
		null
	);
});

test('confirmed exposure wins over incomplete checks', async () => {
	assert.equal(
		(
			await checkSecuritySentinels(
				probes,
				mockFetch({
					dat: new Error('network'),
					txt: new Response('test-token'),
					zip: new Response('', { status: 503 })
				})
			)
		).exposed,
		true
	);
});

test('missing or unwritable sentinels are unknown', async () => {
	assert.equal((await checkSecuritySentinels([])).exposed, null);
	assert.equal((await checkSecuritySentinels([{ ...probes[0], available: false }])).exposed, null);
});
