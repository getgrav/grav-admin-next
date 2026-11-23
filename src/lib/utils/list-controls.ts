import type { BlueprintField } from '$lib/api/endpoints/blueprints';

/** An end of a list: where an actions bar sits, or where a new row goes. */
export type ListEnd = 'top' | 'bottom';

export interface ListControls {
	/** Show the actions bar (expand/collapse all, add) above the rows. */
	top: boolean;
	/** Show the actions bar below the rows. */
	bottom: boolean;
	/** Where the top bar's add button puts the new row. */
	topAdds: ListEnd;
	/** Where the bottom bar's add button puts the new row. */
	bottomAdds: ListEnd;
}

/**
 * Where a `list` field draws its actions bar, and where each bar's add button
 * puts the new row, following classic admin's list template (admin2#225).
 *
 * `controls: top | bottom | both` picks the bars, `bottom` by default. Classic
 * hid both bars for any other value, which left the list with no add button;
 * here an unknown value falls back to the default instead.
 *
 * `placement` picks where a new row goes: `top` prepends from either bar,
 * `position` adds at the end the button sits at, and anything else appends.
 */
export function listControls(field: Pick<BlueprintField, 'controls' | 'placement'>): ListControls {
	const raw = String(field.controls ?? '').trim().toLowerCase();
	const controls = raw === 'top' || raw === 'both' ? raw : 'bottom';
	const placement = String(field.placement ?? '').trim().toLowerCase();

	const adds = (bar: ListEnd): ListEnd =>
		placement === 'position' ? bar : placement === 'top' ? 'top' : 'bottom';

	return {
		top: controls !== 'bottom',
		bottom: controls !== 'top',
		topAdds: adds('top'),
		bottomAdds: adds('bottom')
	};
}
