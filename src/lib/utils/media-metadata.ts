import type { MediaMetaField, MediaMetaFieldValue } from '$lib/api/endpoints/media';

/**
 * The metadata form's edit buffer holds text for every typed field and a
 * boolean for a `boolean` field. An input's `value` must never receive a
 * number or a boolean: a stored `5` or `true` used to fail the
 * `typeof … === 'string'` guard in the text input and render as an empty box.
 */
export type MediaMetaFormValue = string | string[] | boolean;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const NUMBER_TEXT = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * Whether a stored value can be shown by a `number` input. The check mirrors
 * the input's own rule, not `Number()`: that also accepts `0x10` and `0b101`,
 * which a number input renders as empty.
 */
export function isNumericText(value: string): boolean {
	return NUMBER_TEXT.test(value) && Number.isFinite(Number(value));
}

/**
 * Whether a stored value can be shown by a `date` input. Matching the shape is
 * not enough: `2026-02-30` matches it, but a date input renders an impossible
 * day as empty, and a year before 1 is not a valid date at all.
 */
export function isIsoDate(value: string): boolean {
	const match = ISO_DATE.exec(value);
	if (!match) return false;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	if (year < 1) return false;
	// setUTCFullYear, not Date.UTC: the constructor maps years 0-99 to 1900-1999.
	const date = new Date(0);
	date.setUTCFullYear(year, month - 1, day);
	return (
		date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
	);
}

/**
 * A hand-edited sidecar can hold a value that does not fit the configured type
 * (`rating: five`). The API returns it unchanged so it can be fixed here, and
 * the input falls back to text so the value stays visible instead of vanishing.
 */
export function numberInputType(value: string): 'number' | 'text' {
	return value === '' || isNumericText(value) ? 'number' : 'text';
}

export function dateInputType(value: string): 'date' | 'text' {
	return value === '' || isIsoDate(value) ? 'date' : 'text';
}

/**
 * A stored value as editable text. A hand-edited list or map under a scalar
 * field comes back unchanged from the API, so it becomes JSON here rather than
 * blanking the input and being cleared on the next save (`formatExtra` in the
 * form does the same for read-only keys).
 */
function storedText(value: unknown): string {
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	if (value === null || value === undefined) return '';
	return JSON.stringify(value);
}

/** Turn a stored field value into the form-buffer value. */
export function toFormValue(field: MediaMetaField): MediaMetaFormValue {
	if (field.type === 'tags') return Array.isArray(field.value) ? [...field.value] : [];
	if (field.type === 'boolean') {
		if (typeof field.value === 'boolean') return field.value;
		// A hand-written value (`featured: yes`) comes back unchanged so it can
		// be fixed; showing it as an unchecked box and saving would clear it.
		const text = storedText(field.value);
		return text === '' ? false : text;
	}
	return storedText(field.value);
}

/** Fold a form-buffer value back into the shape a metadata response carries. */
export function toStoredValue(
	field: MediaMetaField,
	value: MediaMetaFormValue
): MediaMetaFieldValue {
	if (field.type === 'tags') return Array.isArray(value) ? value : [];
	if (field.type === 'boolean') return typeof value === 'boolean' ? value : String(value);
	if (field.type === 'number') {
		if (typeof value !== 'string') return '';
		return isNumericText(value) ? Number(value) : value;
	}
	if (typeof value === 'string') return value;
	return '';
}

/** True when a value counts as empty for a required check. */
export function isEmptyFormValue(value: unknown): boolean {
	if (typeof value === 'boolean') return value === false;
	if (Array.isArray(value)) return value.length === 0;
	if (typeof value === 'string') return value.trim() === '';
	return value === null || value === undefined;
}
