/**
 * Readable summaries for Flex list column values.
 *
 * A Flex column can point at a field whose stored value is an array — a `list`
 * of rows, a key/value `array`, or a nested map like `{ EN: '…', FR: '…' }`.
 * Coercing those with `String(value)` produces `[object Object]` (or a bare
 * `a,b,c`), so this turns them into a short comma-separated line instead.
 *
 * Everything returned here is plain text that the caller renders through normal
 * Svelte interpolation — never HTML, so there is no escaping to get wrong.
 */

/** Characters a summarized cell shows before it is cut off with an ellipsis. */
const MAX_LENGTH = 120;

/** How far down a nested structure we walk before collapsing to an ellipsis. */
const MAX_DEPTH = 3;

/** Separator between the entries of an object, and between scalar array items. */
const ITEM_SEPARATOR = ', ';

/** Separator between array items that are themselves composite values. */
const GROUP_SEPARATOR = ' · ';

const ELLIPSIS = '…';

export interface CellSummary {
	/** Display text, truncated to `MAX_LENGTH`. */
	text: string;
	/** The untruncated text, for a `title` tooltip. */
	full: string;
	/** Whether `text` was cut short. */
	truncated: boolean;
}

export interface SummarizeOptions {
	/** Static value→label map for the column, applied to scalar leaves. */
	options?: Record<string, string>;
	/** Translated label for `true`. */
	yes?: string;
	/** Translated label for `false`. */
	no?: string;
}

/** Whether a value renders as a single leaf rather than something to walk into. */
export function isScalar(value: unknown): boolean {
	return (
		value === null ||
		value === undefined ||
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'boolean'
	);
}

/** Whether a value is an array whose items can all render as individual pills. */
export function isScalarArray(value: unknown): value is Array<string | number | boolean> {
	return Array.isArray(value) && value.every((item) => isScalar(item));
}

/** Summarize any column value as plain text, ready to drop into a table cell. */
export function summarizeCellValue(value: unknown, opts: SummarizeOptions = {}): CellSummary {
	const full = stringify(value, opts, 0);
	if (full.length <= MAX_LENGTH) {
		return { text: full, full, truncated: false };
	}
	return { text: full.slice(0, MAX_LENGTH).trimEnd() + ELLIPSIS, full, truncated: true };
}

function stringify(value: unknown, opts: SummarizeOptions, depth: number): string {
	if (value === null || value === undefined) return '';
	if (typeof value === 'boolean') return value ? (opts.yes ?? 'Yes') : (opts.no ?? 'No');
	if (typeof value === 'number') return String(value);
	if (typeof value === 'string') return opts.options?.[value] ?? value;

	if (typeof value !== 'object') return String(value);
	if (depth >= MAX_DEPTH) return ELLIPSIS;

	if (Array.isArray(value)) {
		const parts = value.map((item) => stringify(item, opts, depth + 1)).filter((part) => part !== '');
		const separator = value.every((item) => isScalar(item)) ? ITEM_SEPARATOR : GROUP_SEPARATOR;
		return parts.join(separator);
	}

	const entries = Object.entries(value as Record<string, unknown>);
	// A PHP list with gaps in its keys arrives as an object keyed "0", "2", … —
	// those keys carry no meaning, so render it as a plain list of values.
	const keysAreIndexes = entries.length > 0 && entries.every(([key]) => /^\d+$/.test(key));

	return entries
		.map(([key, item]) => {
			const part = stringify(item, opts, depth + 1);
			if (part === '') return '';
			return keysAreIndexes ? part : `${key}: ${part}`;
		})
		.filter((part) => part !== '')
		.join(ITEM_SEPARATOR);
}
