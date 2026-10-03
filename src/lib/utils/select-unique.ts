/**
 * Helpers for the `selectunique` field: a select whose choices already taken by
 * another row of the same list are left out, so each value is used once.
 */

export interface UniqueOption {
	value: string;
	label: string;
}

/**
 * Turn the list-level `selectunique` property into select options. Classic
 * admin took it as either a plain array of values or a `value: label` map; the
 * API sends an empty array when the provider returned nothing.
 */
export function uniqueListOptions(raw: unknown): UniqueOption[] {
	if (Array.isArray(raw)) {
		return raw.flatMap((item): UniqueOption[] => {
			if (item !== null && typeof item === 'object') {
				const o = item as Record<string, unknown>;
				return o.value === undefined || o.value === null
					? []
					: [{ value: String(o.value), label: String(o.label ?? o.value) }];
			}
			return item === undefined || item === null ? [] : [{ value: String(item), label: String(item) }];
		});
	}
	if (raw !== null && typeof raw === 'object') {
		return Object.entries(raw as Record<string, unknown>).map(([value, label]) => ({
			value,
			label: String(label ?? value)
		}));
	}
	return [];
}

/**
 * The values chosen in the other rows of a list, for one sub-field. `rows` is
 * every row's data keyed by sub-field leaf name; the row being edited is left
 * out by index.
 */
export function takenByOtherRows(
	rows: Array<Record<string, unknown>>,
	leaf: string,
	ownIndex: number
): string[] {
	const taken: string[] = [];
	rows.forEach((row, i) => {
		if (i === ownIndex) return;
		const v = row[leaf];
		if (v !== undefined && v !== null && v !== '') taken.push(String(v));
	});
	return taken;
}

/**
 * Drop the options another row already uses. The row's own current value stays
 * even if a stored duplicate means another row holds it too, so opening a list
 * that already contains a repeat never blanks a select.
 */
export function withoutTaken<T extends { value: string }>(
	options: T[],
	taken: readonly unknown[],
	current: unknown
): T[] {
	if (taken.length === 0) return options;
	const gone = new Set(taken.map(String));
	const own = current === undefined || current === null ? '' : String(current);
	return options.filter((o) => o.value === own || !gone.has(o.value));
}
