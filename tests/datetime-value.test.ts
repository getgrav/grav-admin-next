// Pin a zone west of UTC before any Date is built, so a date-only ISO string
// read as UTC midnight would visibly land on the previous day.
process.env.TZ = 'America/Denver';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CalendarDateTime } from '@internationalized/date';
import {
	formatDateTimeForStorage,
	parseDateTimeValue
} from '../src/lib/utils/datetime-value.ts';

// The datetime field writes its value back on every keystroke, and the stored
// string is parsed again to feed the picker. Typing a year over an existing
// date passes through partial years (2, 20, 202), so the stored string and the
// parse of it have to agree for every year, or the picker resyncs to a wrong
// day mid-typing (getgrav/grav-plugin-admin2#221).

const parts = (v: CalendarDateTime | undefined) =>
	v && [v.year, v.month, v.day, v.hour, v.minute].join(' ');

test('partial years round-trip through storage unchanged', () => {
	for (const year of [2, 20, 202, 2027]) {
		const typed = new CalendarDateTime(year, 6, 26, 14, 0);
		assert.equal(parts(parseDateTimeValue(formatDateTimeForStorage(typed))), parts(typed));
	}
});

test('typing 2027 over 2027-06-25 after setting the day to 26 keeps day 26', () => {
	let stored = '2027-06-25 14:00';
	// The day segment is typed first, then the year one digit at a time. The
	// picker takes the day and month from the value it was handed and the year
	// from what has been typed so far, and writes the result back.
	stored = formatDateTimeForStorage(parseDateTimeValue(stored)!.set({ day: 26 }));
	for (const year of [2, 20, 202, 2027]) {
		const current = parseDateTimeValue(stored);
		assert.ok(current, `stored value ${stored} still parses`);
		stored = formatDateTimeForStorage(current.set({ year }));
	}
	assert.equal(stored, '2027-06-26 14:00');
});

test('a stored Y-m-d date is read on that day, not shifted by the time zone', () => {
	assert.equal(parts(parseDateTimeValue('2027-06-26')), '2027 6 26 0 0');
	assert.equal(parts(parseDateTimeValue('2027-06-26 09:05:30')), '2027 6 26 9 5');
	assert.equal(parts(parseDateTimeValue('2027-06-26T09:05')), '2027 6 26 9 5');
});

test('the older formats Grav sites already store still parse', () => {
	assert.equal(parts(parseDateTimeValue('25-06-2027 14:00')), '2027 6 25 14 0');
	assert.equal(parts(parseDateTimeValue('06/25/2027 2:00 pm')), '2027 6 25 14 0');
	assert.equal(parts(parseDateTimeValue('06/25/2027 14:00')), '2027 6 25 14 0');
	assert.equal(parts(parseDateTimeValue('14:00 25-06-2027')), '2027 6 25 14 0');
	assert.equal(parts(parseDateTimeValue(1813932000)), '2027 6 25 14 0');
	assert.equal(parseDateTimeValue('not a date'), undefined);
	assert.equal(parseDateTimeValue(''), undefined);
});
