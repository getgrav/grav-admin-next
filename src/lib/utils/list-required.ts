import type { BlueprintField } from '$lib/api/endpoints/blueprints';

/**
 * Required sub-fields of a `list` field that a row leaves empty.
 *
 * The form's required check only looked at top-level fields, never inside list
 * rows, so "Add item" then Save stored a row with nothing in it. For the
 * scheduler that was `custom_jobs: {1: {output_mode: append}}`, a job with no
 * command (getgrav/grav-plugin-scheduler-webhook#10). Admin-classic stopped
 * this with the browser's own check on each row's inputs.
 *
 * The `key` sub-field is left out: the list stores an unnamed row under a
 * number, so an empty key cannot be told apart from a real one in the data.
 * Nested lists are left out too.
 */
export interface MissingInRow {
	/** Position of the row in the list, from 1. Only meaningful for an array-mode list. */
	row: number;
	/**
	 * For a list stored keyed by its `key` sub-field: the row's name, or null for
	 * a row with no name yet. ListField stores those under a number, and JS puts
	 * integer keys ahead of named ones, so `row` doesn't match the order on screen.
	 */
	key?: string | null;
	field: BlueprintField;
}

/** The leaf name a row stores a sub-field under, as ListField does. */
function leafName(field: BlueprintField): string {
	return field.name.split('.').pop() || field.name;
}

function isBlank(value: unknown): boolean {
	if (value === null || value === undefined) return true;
	if (typeof value === 'string') return value.trim() === '';
	if (Array.isArray(value)) return value.length === 0;
	if (typeof value === 'object') return Object.keys(value as object).length === 0;
	return false;
}

/** The sub-fields of a list that every row must fill in. */
export function requiredRowFields(field: BlueprintField): BlueprintField[] {
	if (field.type !== 'list' || !field.fields?.length) return [];
	return field.fields.filter(
		(child) => child.validate?.required === true && child.type !== 'key' && child.type !== 'list',
	);
}

/** Every required sub-field left empty, row by row, in blueprint order. */
export function missingInListRows(field: BlueprintField, value: unknown): MissingInRow[] {
	const required = requiredRowFields(field);
	if (!required.length || value === null || typeof value !== 'object') return [];

	const keyed = !Array.isArray(value);
	const entries = keyed ? Object.entries(value as Record<string, unknown>) : (value as unknown[]).map((row, i) => [String(i), row] as const);
	const missing: MissingInRow[] = [];
	entries.forEach(([name, row], index) => {
		const data = row !== null && typeof row === 'object' ? (row as Record<string, unknown>) : {};
		for (const child of required) {
			const stored = data[leafName(child)];
			// A sub-field showing its blueprint default isn't empty: the default is what gets saved.
			if (isBlank(isBlank(stored) ? child.default : stored)) {
				missing.push(
					keyed
						? { row: index + 1, key: /^\d+$/.test(name) ? null : name, field: child }
						: { row: index + 1, field: child },
				);
			}
		}
	});
	return missing;
}
