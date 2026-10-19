import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isServerPageRejection } from '../src/lib/utils/server-page-error.ts';

// getgrav/grav#4362: DreamHost's mod_security answered PATCH /config/backups
// with Apache's own "418 I'm a teapot" page, and the save toast only said
// "Request failed with status 418".
const APACHE_418 =
	'<!DOCTYPE HTML PUBLIC "-//IETF//DTD HTML 2.0//EN">\n<html><head>\n' +
	"<title>418 I'm a teapot</title>\n</head><body>\n<h1>I'm a teapot</h1>\n" +
	'<p>The server encountered an internal error or misconfiguration and was unable to complete your request.</p>\n' +
	'</body></html>\n';

test('a 4xx HTML page from the web server is recognised', () => {
	assert.equal(isServerPageRejection(418, APACHE_418), true);
	assert.equal(isServerPageRejection(403, '<html><body>Forbidden</body></html>'), true);
	assert.equal(isServerPageRejection(406, 'Not Acceptable!'), true);
});

test("the API's own JSON errors keep their message", () => {
	const apiError = JSON.stringify({
		status: 403,
		title: 'Forbidden',
		detail: 'Missing permission api.config.write'
	});
	assert.equal(isServerPageRejection(403, apiError), false);
	assert.equal(isServerPageRejection(422, '{"status":422,"errors":[]}'), false);
});

test('empty bodies, 5xx pages and successes are left alone', () => {
	assert.equal(isServerPageRejection(418, ''), false);
	assert.equal(isServerPageRejection(418, '   \n'), false);
	assert.equal(isServerPageRejection(500, '<html>Fatal error</html>'), false);
	assert.equal(isServerPageRejection(404, '<html>Page not found</html>'), false);
	assert.equal(isServerPageRejection(200, '<html></html>'), false);
	assert.equal(isServerPageRejection(302, '<html></html>'), false);
});
