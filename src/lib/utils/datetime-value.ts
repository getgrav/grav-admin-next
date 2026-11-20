import { CalendarDateTime, type DateValue } from '@internationalized/date';

/** Build a CalendarDateTime from a native Date. */
export function toCalendar(d: Date): CalendarDateTime {
	return new CalendarDateTime(
		d.getFullYear(),
		d.getMonth() + 1,
		d.getDate(),
		d.getHours(),
		d.getMinutes(),
		d.getSeconds()
	);
}

/**
 * Parse a date value into a CalendarDateTime.
 * Handles Unix-timestamp integers as well as common Grav date string
 * formats: ISO, d-m-Y H:i, m/d/Y h:i a, etc.
 */
export function parseDateTimeValue(val: unknown): CalendarDateTime | undefined {
	if (val === null || val === undefined) return undefined;

	// Numeric epoch. YAML parses an unquoted ISO datetime (e.g.
	// `date: 2026-03-17T16:30:00`) as a Unix timestamp, so header dates
	// often reach us as integers rather than strings — accept seconds or
	// milliseconds. A bare numeric string (e.g. after an untouched save
	// round-trips it back through YAML) is treated the same way.
	if (typeof val === 'number' || (typeof val === 'string' && /^\d{9,}$/.test(val.trim()))) {
		const n = typeof val === 'number' ? val : parseInt(val.trim(), 10);
		if (!Number.isFinite(n) || n <= 0) return undefined;
		// < 1e12 is seconds (1e12s ≈ year 33658, 1e12ms ≈ 2001).
		const d = new Date(n < 1e12 ? n * 1000 : n);
		if (isNaN(d.getTime())) return undefined;
		// YAML reads an unquoted `...T16:30:00` as UTC, so read the epoch's
		// UTC wall-clock to show the same time the author typed, rather than
		// shifting it into the browser's local zone.
		return new CalendarDateTime(
			d.getUTCFullYear(),
			d.getUTCMonth() + 1,
			d.getUTCDate(),
			d.getUTCHours(),
			d.getUTCMinutes(),
			d.getUTCSeconds()
		);
	}

	if (typeof val !== 'string') return undefined;
	const str = val.trim();
	if (!str) return undefined;

	// 0. Y-m-d H:i(:s), the format formatDateTimeForStorage() writes. Read it
	// field by field rather than through `new Date()`: V8 reads a padded
	// partial year such as `0002-06-26 14:00` as 2026-02-06 and rejects
	// `0020-06-26 14:00` outright, and a bare `2027-06-26` is UTC midnight,
	// which lands on the 25th west of Greenwich. The field writes back on
	// every keystroke, so a half-typed year has to survive this round trip
	// (getgrav/grav-plugin-admin2#221).
	const iso = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
	if (iso) {
		const [year, month, day, hour, min, sec] = iso.slice(1).map((n) => parseInt(n || '0', 10));
		if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || min > 59 || sec > 59) {
			return undefined;
		}
		return new CalendarDateTime(year, month, day, hour, min, sec);
	}

	let d: Date | null = null;

	// 1. Try d-m-Y H:i(:s) — European format (must check before Date constructor)
	let match = str.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
	if (match) {
		const [, day, month, year, hour, min, sec] = match;
		const y = year.length <= 2 ? 2000 + parseInt(year) : parseInt(year);
		d = new Date(y, parseInt(month) - 1, parseInt(day), parseInt(hour || '0'), parseInt(min || '0'), parseInt(sec || '0'));
	}

	// 2. Try m/d/Y h:i a — US format with AM/PM
	if (!d || isNaN(d.getTime())) {
		match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})\s*(am|pm)$/i);
		if (match) {
			const [, month, day, year, hour, min, ampm] = match;
			const y = year.length <= 2 ? 2000 + parseInt(year) : parseInt(year);
			let h = parseInt(hour);
			if (ampm.toLowerCase() === 'pm' && h !== 12) h += 12;
			if (ampm.toLowerCase() === 'am' && h === 12) h = 0;
			d = new Date(y, parseInt(month) - 1, parseInt(day), h, parseInt(min));
		}
	}

	// 3. Try m/d/Y H:i — US format with 24h time
	if (!d || isNaN(d.getTime())) {
		match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
		if (match) {
			const [, month, day, year, hour, min, sec] = match;
			const y = year.length <= 2 ? 2000 + parseInt(year) : parseInt(year);
			d = new Date(y, parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(min), parseInt(sec || '0'));
		}
	}

	// 4. Try H:i d-m-Y or h:i a m/d/Y — time-first formats
	if (!d || isNaN(d.getTime())) {
		match = str.match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
		if (match) {
			const [, hour, min, day, month, year] = match;
			const y = year.length <= 2 ? 2000 + parseInt(year) : parseInt(year);
			d = new Date(y, parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(min));
		}
	}

	if (!d || isNaN(d.getTime())) {
		match = str.match(/^(\d{1,2}):(\d{2})\s*(am|pm)\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/i);
		if (match) {
			const [, hour, min, ampm, month, day, year] = match;
			const y = year.length <= 2 ? 2000 + parseInt(year) : parseInt(year);
			let h = parseInt(hour);
			if (ampm.toLowerCase() === 'pm' && h !== 12) h += 12;
			if (ampm.toLowerCase() === 'am' && h === 12) h = 0;
			d = new Date(y, parseInt(month) - 1, parseInt(day), h, parseInt(min));
		}
	}

	// 5. Fallback to Date constructor (handles ISO, Y-m-d, Y-m-d H:i:s, etc.)
	if (!d || isNaN(d.getTime())) {
		d = new Date(str);
	}

	if (!d || isNaN(d.getTime())) return undefined;

	return toCalendar(d);
}

/**
 * Format CalendarDateTime to ISO-8601 Y-m-d H:i for Grav storage.
 *
 * The old admin wrote day-first d-m-Y, but that is ambiguous to JS
 * `new Date()` (e.g. `03-04-2026` reads as March 4th, not April 3rd),
 * so the Page Information sidebar rendered "Invalid Date" reading it back.
 * ISO is unambiguous and parses everywhere. See admin2#134.
 *
 * The year is padded to four digits: the picker writes back on every
 * keystroke, and an unpadded half-typed year (`20-06-26 14:00`) reads back
 * as day-first d-m-Y, moving the day (admin2#221).
 */
export function formatDateTimeForStorage(date: DateValue | undefined): string {
	if (!date) return '';
	const d = String(date.day).padStart(2, '0');
	const m = String(date.month).padStart(2, '0');
	const y = String(date.year).padStart(4, '0');
	if ('hour' in date) {
		const dt = date as CalendarDateTime;
		const h = String(dt.hour).padStart(2, '0');
		const min = String(dt.minute).padStart(2, '0');
		return `${y}-${m}-${d} ${h}:${min}`;
	}
	return `${y}-${m}-${d}`;
}
