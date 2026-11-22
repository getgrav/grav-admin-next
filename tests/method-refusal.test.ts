import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMethodRefusal } from '../src/lib/utils/server-page-error.ts';

// getgrav/grav-plugin-admin2#219: on OVH shared hosting, Apache answers PATCH
// and DELETE with its own 403 page while GET and POST reach Grav. Config saves
// (PATCH) and Clear Cache (DELETE) failed; plugin updates (POST) worked. The
// client only retried as POST + X-HTTP-Method-Override on a 405.
//
// Run: node --test tests/method-refusal.test.ts

const APACHE_403 =
	'<!DOCTYPE HTML PUBLIC "-//IETF//DTD HTML 2.0//EN">\n<html><head>\n<title>403 Forbidden</title>\n</head><body>\n' +
	"<h1>Forbidden</h1>\n<p>You don't have permission to access this resource.</p>\n</body></html>\n";
const GRAV_403 = JSON.stringify({ status: 403, title: 'Forbidden', detail: 'Missing permission api.config.write' });

test("Apache's own 403 page on a PATCH or DELETE is a method refusal", () => {
	assert.equal(isMethodRefusal('PATCH', 403, APACHE_403), true);
	assert.equal(isMethodRefusal('delete', 403, APACHE_403), true);
	assert.equal(isMethodRefusal('PUT', 403, APACHE_403), true);
});

test('a 405 on a mutation verb is still a method refusal, whatever the body', () => {
	assert.equal(isMethodRefusal('DELETE', 405, ''), true);
	assert.equal(isMethodRefusal('PATCH', 405, GRAV_403), true);
});

test("Apache's 501 for an unimplemented method is a method refusal", () => {
	assert.equal(isMethodRefusal('PATCH', 501, '<html><body>Not Implemented</body></html>'), true);
	assert.equal(isMethodRefusal('PATCH', 501, ''), true);
});

test("Grav's own JSON 403 is a real permission answer, not a refusal", () => {
	assert.equal(isMethodRefusal('PATCH', 403, GRAV_403), false);
});

test('GET and POST are never retried with an override', () => {
	assert.equal(isMethodRefusal('POST', 403, APACHE_403), false);
	assert.equal(isMethodRefusal('GET', 405, ''), false);
});

test('other statuses are left alone', () => {
	assert.equal(isMethodRefusal('PATCH', 404, APACHE_403), false);
	assert.equal(isMethodRefusal('PATCH', 500, APACHE_403), false);
	assert.equal(isMethodRefusal('DELETE', 418, APACHE_403), false);
});
