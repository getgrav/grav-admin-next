/**
 * Sidebar order and visibility (the `sidebarLayout` preference).
 *
 * Items are named by id: core items by name (`pages`), plugin items as
 * `plugin:<id>`, and `divider` for the line between the core and plugin
 * groups. A layout saves the full order plus the hidden ids; an empty order
 * means the built-in one. A plugin item can offer sub-items (`children`),
 * named `plugin:<id>/<child id>`; they show under it only once listed in
 * `shown`.
 */

export interface SidebarLayout {
	order: string[];
	hidden: string[];
	/** Sub-items switched on. */
	shown: string[];
}

export const DIVIDER_ID = 'divider';
export const PLUGIN_PREFIX = 'plugin:';

export const EMPTY_SIDEBAR_LAYOUT: SidebarLayout = { order: [], hidden: [], shown: [] };

export function childId(parentId: string, id: string): string {
	return `${parentId}/${id}`;
}

export function asSidebarLayout(value: unknown): SidebarLayout {
	const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
	const ids = (list: unknown) => (Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : []);
	return { order: ids(v.order), hidden: ids(v.hidden), shown: ids(v.shown) };
}

/**
 * Put the sidebar's items (`defaults`, in built-in order) in the saved order.
 * Saved ids the sidebar doesn't have right now are skipped. An item the saved
 * order doesn't mention keeps its built-in place, after the item before it,
 * except a plugin item, which goes last: a plugin installed later lands at the
 * bottom, as it always has, rather than next to whatever was moved.
 */
export function resolveSidebarOrder(defaults: string[], order: string[]): string[] {
	const known = new Set(defaults);
	const out: string[] = [];
	for (const id of order) {
		if (known.has(id) && !out.includes(id)) out.push(id);
	}
	defaults.forEach((id, i) => {
		if (out.includes(id)) return;
		if (id.startsWith(PLUGIN_PREFIX)) {
			out.push(id);
			return;
		}
		let at = 0;
		for (let j = i - 1; j >= 0; j--) {
			const k = out.indexOf(defaults[j]);
			if (k !== -1) {
				at = k + 1;
				break;
			}
		}
		out.splice(at, 0, id);
	});
	return out;
}

/** Move `id` to `index` (its index after the move). */
export function moveSidebarItem(order: string[], id: string, index: number): string[] {
	const from = order.indexOf(id);
	if (from === -1) return order;
	const to = Math.max(0, Math.min(order.length - 1, index));
	if (to === from) return order;
	const next = [...order];
	next.splice(from, 1);
	next.splice(to, 0, id);
	return next;
}

/**
 * The ids to draw outside edit mode: hidden items dropped, and a divider only
 * between two items (never first, last, or next to another divider).
 */
export function visibleSidebarIds(order: string[], hidden: string[]): string[] {
	const shown = order.filter((id) => !hidden.includes(id));
	return shown.filter((id, i) => {
		if (id !== DIVIDER_ID) return true;
		const before = shown.slice(0, i).filter((x) => x !== DIVIDER_ID);
		const after = shown.slice(i + 1).filter((x) => x !== DIVIDER_ID);
		return before.length > 0 && after.length > 0 && shown[i - 1] !== DIVIDER_ID;
	});
}

/**
 * The layout to store for an order the user arranged: an empty order when it
 * is the built-in one, so the sidebar keeps following the built-in order (and
 * places new items) instead of a frozen copy of it. `children` are the
 * sub-item ids the sidebar has; switched-on ones it doesn't have are dropped.
 */
export function layoutToSave(defaults: string[], order: string[], hidden: string[], shown: string[] = [], children: string[] = []): SidebarLayout {
	const keptHidden = hidden.filter((id) => order.includes(id));
	const keptShown = children.filter((id) => shown.includes(id));
	if (keptHidden.length === 0 && sameIds(order, defaults)) return { order: [], hidden: [], shown: keptShown };
	return { order: [...order], hidden: keptHidden, shown: keptShown };
}

export function sameIds(a: string[], b: string[]): boolean {
	return a.length === b.length && a.every((id, i) => id === b[i]);
}

/**
 * Whether two layouts draw the same sidebar for these items. Hidden ids the
 * sidebar doesn't have don't count.
 */
export function sameSidebar(defaults: string[], a: SidebarLayout, b: SidebarLayout, children: string[] = []): boolean {
	if (!sameIds(resolveSidebarOrder(defaults, a.order), resolveSidebarOrder(defaults, b.order))) return false;
	const hiddenA = defaults.filter((id) => a.hidden.includes(id));
	const hiddenB = defaults.filter((id) => b.hidden.includes(id));
	const shownA = children.filter((id) => a.shown.includes(id));
	const shownB = children.filter((id) => b.shown.includes(id));
	return sameIds(hiddenA, hiddenB) && sameIds(shownA, shownB);
}
