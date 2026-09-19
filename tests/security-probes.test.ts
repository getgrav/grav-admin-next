import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	SNOOZE_MS,
	bannerStateFor,
	checkSecuritySentinels,
	classifyExposure,
	exposureSignature,
	type ProbeResult
} from '../src/lib/api/security-probes.ts';

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
		const url = new URL(String(input));
		assert.match(url.search, /^\?_=[a-z0-9]+$/);
		const response = responses[url.pathname.split('.').pop()!];
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
	assert.equal(result.exposed, true);
	assert.deepEqual(result.exposedFiles, ['backup/*.txt', 'backup/*.zip']);
	assert.deepEqual(result.results, [
		{ location: 'backup', extension: 'dat', exposed: false },
		{ location: 'backup', extension: 'txt', exposed: true },
		{ location: 'backup', extension: 'zip', exposed: true }
	]);
	assert.equal(classifyExposure(result.results), 'by-type');
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

test('every request carries a fresh cache-busting query', async () => {
	const seen: string[] = [];
	const fetcher: typeof fetch = async (input) => {
		seen.push(String(input));
		return new Response('', { status: 403 });
	};
	await checkSecuritySentinels(probes, fetcher);
	await checkSecuritySentinels(probes, fetcher);
	assert.equal(new Set(seen).size, seen.length);
	assert.ok(seen.every((url) => /\/backup\/probe\.(dat|txt|zip)\?_=[a-z0-9]+$/.test(url)));
});

const grid = (served: (location: string, extension: string) => boolean | null): ProbeResult[] =>
	['user/data', 'backup', 'tmp'].flatMap((location) =>
		['dat', 'txt', 'zip', 'json'].map((extension) => ({
			location,
			extension,
			exposed: served(location, extension)
		}))
	);

test('classifies an .htaccess that predates the tmp/ rule', () => {
	assert.equal(classifyExposure(grid((l) => l === 'tmp')), 'tmp');
	// Subfolder installs report the path from the web root.
	assert.equal(
		classifyExposure(
			grid((l) => l === 'tmp').map((r) => ({ ...r, location: `site/${r.location}` }))
		),
		'tmp'
	);
});

test('classifies a static-file layer serving some types before the rules', () => {
	assert.equal(classifyExposure(grid((_, e) => e === 'zip')), 'by-type');
	assert.equal(classifyExposure(grid((l, e) => l === 'tmp' && e !== 'dat')), 'by-type');
});

test('classifies rules that are not applied at all', () => {
	assert.equal(classifyExposure(grid(() => true)), 'all');
	// Inconclusive probes do not stop the verdict.
	assert.equal(classifyExposure(grid((_, e) => (e === 'json' ? null : true))), 'all');
});

test('falls back to unknown when the pattern does not point anywhere', () => {
	assert.equal(classifyExposure([]), 'unknown');
	assert.equal(classifyExposure(grid(() => false)), 'unknown');
	assert.equal(classifyExposure(grid((l) => l !== 'backup')), 'unknown');
	// Older APIs return a single probe with no location.
	assert.equal(classifyExposure([{ location: '', extension: '', exposed: true }]), 'unknown');
});

test('snooze lasts 24 hours and collapse persists, both only for the same exposed files', () => {
	const now = 1_000_000;
	const signature = exposureSignature(['tmp/*.zip', 'backup/*.zip']);
	assert.equal(signature, exposureSignature(['backup/*.zip', 'tmp/*.zip']));

	const saved = { signature, collapsed: true, snoozedUntil: now + SNOOZE_MS };
	assert.deepEqual(bannerStateFor(saved, signature, now), { collapsed: true, snoozed: true });
	assert.deepEqual(bannerStateFor(saved, signature, now + SNOOZE_MS + 1), {
		collapsed: true,
		snoozed: false
	});
	assert.deepEqual(bannerStateFor(saved, exposureSignature(['tmp/*.zip']), now), {
		collapsed: false,
		snoozed: false
	});
	assert.deepEqual(bannerStateFor(null, signature, now), { collapsed: false, snoozed: false });
});
