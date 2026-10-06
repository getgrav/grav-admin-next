/**
 * The title a collapsed list row shows.
 *
 * It is the first sub-field, in blueprint order, that holds text. Classic admin
 * collapsed a row down to its first field, so the order the blueprint lists
 * the fields in has always decided the title. A row's `data` is not in that
 * order: a new row is seeded with its fields' defaults first, then gains the
 * rest as they are filled, so reading `Object.values(data)` titled a row by
 * whichever field happened to be stored first (getgrav/grav-plugin-admin2#190).
 *
 * `leafNames` are the sub-fields' names in blueprint order. Data that matches
 * none of them (stale keys, or a bare value from an older save) still gives a
 * title, from the first text in stored order.
 */
export function listItemTitle(data: Record<string, unknown>, leafNames: readonly string[]): string {
	for (const name of leafNames) {
		const v = data[name];
		if (typeof v === 'string' && v) return v;
	}
	for (const v of Object.values(data)) {
		if (typeof v === 'string' && v) return v;
	}
	return '';
}
