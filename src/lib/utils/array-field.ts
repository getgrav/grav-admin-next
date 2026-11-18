/**
 * Helpers for the `array` blueprint field. Kept free of Svelte so they can be
 * tested on their own (tests/array-field.test.ts).
 */

export interface ArrayFieldRow {
	key: string;
	value: string;
}

/**
 * A stored `array` field value as rows, whichever way it arrived.
 *
 * The API sends a PHP array with keys 0..n as a JSON list and any other array
 * as a JSON object, so the same field can hold either: `kitchen: [a, b]` is a
 * list, `kitchen: {0: a, 4: b}` is an object. A list's rows get their indexes
 * as keys (what the classic admin showed), and in `value_only` mode an
 * object's keys are dropped. Reading only one of the two left the field empty,
 * and the next edit replaced the hidden entries (getgrav/grav-plugin-admin2#218).
 */
export function arrayFieldRows(value: unknown, valueOnly: boolean): ArrayFieldRow[] {
	if (value === null || typeof value !== 'object') return [];
	const pairs: Array<[string, unknown]> = Array.isArray(value)
		? value.map((v, i) => [String(i), v])
		: Object.entries(value as Record<string, unknown>);
	return pairs.map(([key, v]) => ({ key: valueOnly ? '' : key, value: String(v ?? '') }));
}
