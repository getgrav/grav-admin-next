import type { ColumnFormatter } from '$lib/api/endpoints/users';

/**
 * A rendered column cell, expressed as safe structured data — never HTML. The
 * cell component maps `kind` to plain text, an anchor, or a badge. Because a
 * plugin only ever supplies a scalar value plus a formatter name (both server-
 * validated), there is no path for markup or behaviour to reach the DOM.
 */
export type FormattedCell =
	| { kind: 'text'; text: string }
	| { kind: 'badge'; text: string }
	| { kind: 'boolean'; value: boolean }
	| { kind: 'link'; text: string; href: string };

const EMPTY: FormattedCell = { kind: 'text', text: '—' };

type Scalar = string | number | boolean | null | undefined;

/**
 * Turn a plugin-supplied scalar into a safe, renderable cell for the given
 * formatter. Unknown formatters and unparseable values degrade to plain text
 * (or an em-dash for empty values) rather than throwing.
 */
export function formatColumnValue(value: Scalar, formatter: ColumnFormatter): FormattedCell {
	if (value === null || value === undefined || value === '') {
		return EMPTY;
	}

	switch (formatter) {
		case 'boolean':
			return { kind: 'boolean', value: toBoolean(value) };

		case 'number': {
			const n = typeof value === 'number' ? value : Number(value);
			return Number.isFinite(n) ? { kind: 'text', text: numberFormat.format(n) } : { kind: 'text', text: String(value) };
		}

		case 'date':
			return { kind: 'text', text: formatDate(value, false) };

		case 'datetime':
			return { kind: 'text', text: formatDate(value, true) };

		case 'link': {
			const href = safeHref(String(value));
			return href ? { kind: 'link', text: String(value), href } : { kind: 'text', text: String(value) };
		}

		case 'badge':
			return { kind: 'badge', text: String(value) };

		case 'text':
		default:
			return { kind: 'text', text: String(value) };
	}
}

const numberFormat = new Intl.NumberFormat();

function toBoolean(value: Scalar): boolean {
	if (typeof value === 'boolean') return value;
	if (typeof value === 'number') return value !== 0;
	const s = String(value).trim().toLowerCase();
	return s === 'true' || s === '1' || s === 'yes' || s === 'on';
}

function formatDate(value: Scalar, withTime: boolean): string {
	// Accept ISO strings and unix timestamps (seconds or milliseconds).
	let date: Date;
	if (typeof value === 'number') {
		date = new Date(value < 1e12 ? value * 1000 : value);
	} else {
		const raw = String(value);
		const num = Number(raw);
		date = Number.isFinite(num) && /^\d+$/.test(raw.trim())
			? new Date(num < 1e12 ? num * 1000 : num)
			: new Date(raw);
	}
	if (Number.isNaN(date.getTime())) return String(value);
	return withTime ? date.toLocaleString() : date.toLocaleDateString();
}

/**
 * Only allow a link the browser can't be tricked by: same-origin relative
 * paths, or absolute http(s) URLs. Everything else (javascript:, data:, etc.)
 * is rejected so the value renders as inert text instead.
 */
function safeHref(value: string): string | null {
	const trimmed = value.trim();
	if (trimmed === '') return null;

	// Relative path or protocol-relative that stays same-scheme.
	if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;

	try {
		const url = new URL(trimmed, window.location.origin);
		return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
	} catch {
		return null;
	}
}
