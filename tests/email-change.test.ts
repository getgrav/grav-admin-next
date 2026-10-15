import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emailChangeRefusal, metaMessage } from '../src/lib/utils/email-change.ts';

// What ApiRequestError looks like to these helpers: a status, the parsed error
// body and the composed message.
const refused = (status: number, detail: string, message = detail) => ({
	status,
	error: { status, title: 'x', detail },
	message
});

test('reads the message the API sends after starting a change', () => {
	assert.equal(
		metaMessage({ message: 'We sent a confirmation link to new@example.com.' }),
		'We sent a confirmation link to new@example.com.'
	);
});

test('no message in meta reads as undefined', () => {
	assert.equal(metaMessage(undefined), undefined);
	assert.equal(metaMessage(null), undefined);
	assert.equal(metaMessage('text'), undefined);
	assert.equal(metaMessage({}), undefined);
	assert.equal(metaMessage({ message: '  ' }), undefined);
	assert.equal(metaMessage({ message: 5 }), undefined);
});

test('a taken address (422) shows the sentence the server wrote', () => {
	const taken = 'Email address a@b.c already exists, please pick another email address';
	assert.equal(emailChangeRefusal(refused(422, taken)), taken);
});

test('a 422 with field errors shows the field messages, as the rest of the app does', () => {
	assert.equal(
		emailChangeRefusal(
			refused(
				422,
				'The submitted data did not pass blueprint validation',
				'Must be a valid email address'
			)
		),
		'Must be a valid email address'
	);
});

test('too many changes (429) shows the detail, not the composed message', () => {
	const slow = 'Too many email change requests. Please try again in 60 minutes.';
	assert.equal(emailChangeRefusal(refused(429, slow, 'something else')), slow);
});

test('other failures keep the generic message', () => {
	assert.equal(emailChangeRefusal(refused(409, 'Precondition failed')), null);
	assert.equal(emailChangeRefusal(refused(500, 'Email Not Sent')), null);
	assert.equal(emailChangeRefusal(new Error('network')), null);
	assert.equal(emailChangeRefusal(null), null);
	assert.equal(emailChangeRefusal(refused(422, '', '')), null);
});
