import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// getgrav/grav-admin-next#46: the login page and the sign-in-again dialog hide
// the password form when the API's show_password_form is off. Once the form can
// disappear, the sign-in options have to belong to the right server, arrive
// before anything is drawn, survive a failed request, and leave focus somewhere
// useful.
//
// Run: node --test tests/login-options.test.ts

const root = new URL('../src/', import.meta.url).pathname;
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const authApi = read('lib/api/auth.ts');
const client = read('lib/api/client.ts');
const loginPage = read('routes/login/+page.svelte');
const reauth = read('lib/components/auth/ReauthModal.svelte');
const callback = read('routes/oauth-callback/+page.svelte');

test('getLoginOptions says whether the server answered and asks again after a failure', () => {
	assert.match(authApi, /ok: boolean;/);
	assert.match(authApi, /LOGIN_OPTIONS_RETRY_MS = \[/);
	assert.match(authApi, /export async function getLoginOptions\(signal\?: AbortSignal\)/);
});

test('getSsoProviders is gone; getLoginOptions replaced it', () => {
	assert.doesNotMatch(authApi, /getSsoProviders/);
	assert.doesNotMatch(loginPage + reauth, /getSsoProviders/);
});

test('GETs in flight are shared per server, not across servers', () => {
	const requestKey = client.match(/private requestKey\([\s\S]*?\n\t\}/)?.[0] ?? '';
	assert.match(requestKey, /this\.baseUrl/);
});

test('the login page loads the options again when the server fields change', () => {
	assert.match(loginPage, /id="server-url"[\s\S]*?onchange=\{serverFieldsChanged\}/);
	assert.match(loginPage, /id="environment"[\s\S]*?onchange=\{serverFieldsChanged\}/);
	assert.match(loginPage, /function serverFieldsChanged\(\) \{\s*auth\.setServer\(serverUrl, environment\);\s*probeServer\(\);/);
	// Captcha and passkeys belong to the server too.
	const probe = loginPage.match(/function probeServer\([\s\S]*?\n\t\}/)?.[0] ?? '';
	assert.match(probe, /getLoginOptions\(/);
	assert.match(probe, /getCaptchaConfig\(/);
	assert.match(probe, /getPasskeyEnabled\(/);
});

test('the login page only uses options loaded for the server in the fields', () => {
	assert.match(loginPage, /const optionsApply = \$derived\(optionsFor === fieldsKey\)/);
	assert.match(loginPage, /\{#each providers as provider/);
	assert.doesNotMatch(loginPage, /\{#each ssoProviders as provider/);
});

test('the login page waits for the options before drawing the form', () => {
	assert.match(loginPage, /const ready = \$derived\(waitedLongEnough \|\| \(setupChecked && i18n\.loaded && optionsLoaded\)\)/);
});

test('passkey autofill only runs while the password form is shown', () => {
	const autofill = loginPage.match(/async function startAutofill\(\) \{[\s\S]*?\n\t\t\}/)?.[0] ?? '';
	assert.match(autofill, /!showPasswordForm/);
});

test('a refused SSO sign-in shows a message on the login page, or reaches the dialog that opened the popup', () => {
	assert.match(loginPage, /searchParams\.get\('sso_error'\)/);
	assert.match(loginPage, /reportSsoToOpener\(null, true\)/);
	assert.match(loginPage, /ADMIN_NEXT\.LOGIN\.SSO_FAILED/);
	assert.match(callback, /reportSsoToOpener\(/);
});

test('the sign-in-again dialog loads the options on every opening and waits for them', () => {
	assert.doesNotMatch(reauth, /ssoLoaded/);
	assert.match(reauth, /optionsLoaded/);
	assert.match(reauth, /ononline=/);
});

test('the sign-in-again dialog focuses what is there: code, password, provider, or itself', () => {
	const focus = reauth.match(/\/\/ Focus[\s\S]*?\n\t\}\);/)?.[0] ?? '';
	for (const target of ['reauth-code', 'reauth-password', 'reauth-sso', 'reauth-dialog']) {
		assert.match(focus, new RegExp(target));
	}
	assert.match(reauth, /id="reauth-dialog"[\s\S]*?tabindex="-1"|tabindex="-1"[\s\S]*?id="reauth-dialog"/);
});
