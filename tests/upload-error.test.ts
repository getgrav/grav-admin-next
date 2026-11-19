import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isApiForbiddenUpload, uploadErrorMessage } from '../src/lib/utils/upload-error.ts';

// A Cloudflare managed challenge (OWASP rule 949110) answered admin2 media
// uploads with an HTML 403, and the media panel blamed the page's permissions.
const CLOUDFLARE_CHALLENGE =
	'<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title></head><body></body></html>';
const API_FORBIDDEN = JSON.stringify({
	status: 403,
	title: 'Forbidden',
	detail: "Changing this page's media requires permission to update the page."
});

const xhr = (status: number, responseText: string) => ({ status, responseText }) as XMLHttpRequest;
const serverPage = (status: number) => `blocked (${status})`;

test("the API's own 403 is a refusal to change the page's media", () => {
	assert.equal(isApiForbiddenUpload(new Error('x'), xhr(403, API_FORBIDDEN)), true);
});

test('a firewall page, demo mode and other statuses are not', () => {
	assert.equal(isApiForbiddenUpload(new Error('x'), xhr(403, CLOUDFLARE_CHALLENGE)), false);
	assert.equal(
		isApiForbiddenUpload(new Error('x'), xhr(403, '{"status":403,"code":"demo_mode_write_blocked"}')),
		false
	);
	assert.equal(isApiForbiddenUpload(new Error('x'), xhr(413, '{"status":413}')), false);
	assert.equal(isApiForbiddenUpload(new Error('x')), false);
});

test('the XHR kept on a NetworkError counts too', () => {
	const error = Object.assign(new Error('network'), { request: xhr(403, API_FORBIDDEN) });
	assert.equal(isApiForbiddenUpload(error), true);
});

test('a firewall page gets the server-page explanation', () => {
	assert.equal(uploadErrorMessage(new Error('network'), xhr(403, CLOUDFLARE_CHALLENGE), serverPage), 'blocked (403)');
});

test('API errors keep their detail, and the old behaviour stands without a serverPage callback', () => {
	assert.equal(
		uploadErrorMessage(new Error('network'), xhr(422, '{"detail":"Stream not resolvable"}'), serverPage),
		'Stream not resolvable'
	);
	assert.equal(uploadErrorMessage(new Error('network'), xhr(403, CLOUDFLARE_CHALLENGE)), 'network');
});
