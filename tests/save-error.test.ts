import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveErrorMessage } from '../src/lib/utils/save-error.ts';
import { SERVER_PAGE_CODE } from '../src/lib/utils/server-page-error.ts';

const FALLBACK = 'Failed to save configuration.';

// An ApiRequestError as the client builds it: `message` is composed from the
// ApiError, which rides along on `error`.
function apiError(error: { status: number; title: string; detail?: string; code?: string }) {
	return Object.assign(new Error(error.detail || error.title), { error, response: {} });
}

// getgrav/grav-plugin-admin2#219: a firewall answered the plugin config PATCH
// with its own 403 page. The system config page named the firewall; the plugin
// page said only "Failed to save configuration."
test('a page the web server or a firewall wrote is named, not hidden', () => {
	const err = apiError({
		status: 403,
		title: 'Blocked before it reached Grav',
		detail: 'Something in front of Grav answered this request itself (HTTP 403).',
		code: SERVER_PAGE_CODE,
	});
	assert.equal(saveErrorMessage(err, FALLBACK), 'Something in front of Grav answered this request itself (HTTP 403).');
});

test("the API's own explanation is shown", () => {
	const err = apiError({ status: 403, title: 'Forbidden', detail: 'You need api.config.write to change this.' });
	assert.equal(saveErrorMessage(err, FALLBACK), 'You need api.config.write to change this.');
});

test('a bare status with nothing from the server keeps the generic message', () => {
	const err = apiError({ status: 500, title: 'Internal Server Error', detail: 'Request failed with status 500' });
	assert.equal(saveErrorMessage(err, FALLBACK), FALLBACK);
});

test('anything that is not an API error keeps the generic message', () => {
	assert.equal(saveErrorMessage(new TypeError('Failed to fetch'), FALLBACK), FALLBACK);
	assert.equal(saveErrorMessage(undefined, FALLBACK), FALLBACK);
});
