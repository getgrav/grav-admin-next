/**
 * Sidebar order and visibility (the `sidebarLayout` preference).
 *
 * Items are named by id: core items by name (`pages`), plugin items as
 * `plugin:<id>`, and `divider` for the line between the core and plugin
 * groups. A layout saves the full order plus the hidden ids; an empty order
 * means the built-in one. A plugin item can offer shortcuts (`children`); the
 * ones a user picked are kept in `shortcuts` under the item's id, and an item
 * with no entry there shows the ones its plugin marks `default`.
 */

export interface SidebarLayout {
	order: string[];
	hidden: string[];
	/** Child ids picked to show under a plugin item, by the item's id (`plugin:<id>`). */
	shortcuts: Record<string, string[]>;
}

/** What the layout needs to know about a plugin item's children. */
export interface ShortcutChild {
	id: string;
	default?: boolean;
}

export const DIVIDER_ID = 'divider';
export const PLUGIN_PREFIX = 'plugin:';

export const EMPTY_SIDEBAR_LAYOUT: SidebarLayout = { order: [], hidden: [], shortcuts: {} };

export function asSidebarLayout(value: unknown): SidebarLayout {
	const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
	const ids = (list: unknown) => (Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : []);
	const shortcuts: Record<string, string[]> = {};
	// An empty map arrives from PHP as `[]`, which has no entries anyway.
	if (v.shortcuts && typeof v.shortcuts === 'object' && !Array.isArray(v.shortcuts)) {
		for (const [item, list] of Object.entries(v.shortcuts)) {
			if (Array.isArray(list)) shortcuts[item] = ids(list);
		}
	}
	return { order: ids(v.order), hidden: ids(v.hidden), shortcuts };
}

/**
 * The ids of the children showing under a plugin item, in the plugin's order:
 * the ones picked, or the plugin's defaults when nothing was picked.
 */
export function shownShortcuts(shortcuts: Record<string, string[]>, itemId: string, children: ShortcutChild[]): string[] {
	const picked = shortcuts[itemId];
	return children.filter((c) => (picked ? picked.includes(c.id) : c.default === true)).map((c) => c.id);
}

/** `shortcuts` with one child of an item switched on or off. */
export function withShortcut(
	shortcuts: Record<string, string[]>,
	itemId: string,
	children: ShortcutChild[],
	childId: string,
	on: boolean,
): Record<string, string[]> {
	const shown = shownShortcuts(shortcuts, itemId, children).filter((id) => id !== childId);
	const next = on ? children.filter((c) => c.id === childId || shown.includes(c.id)).map((c) => c.id) : shown;
	return { ...shortcuts, [itemId]: next };
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
 * places new items) instead of a frozen copy of it. Hidden ids the sidebar
 * doesn't have are dropped.
 */
export function layoutToSave(defaults: string[], order: string[], hidden: string[], shortcuts: Record<string, string[]> = {}): SidebarLayout {
	return { order: sameIds(order, defaults) ? [] : [...order], hidden: order.filter((id) => hidden.includes(id)), shortcuts };
}

export function sameIds(a: string[], b: string[]): boolean {
	return a.length === b.length && a.every((id, i) => id === b[i]);
}

/**
 * Whether two layouts draw the same sidebar for these items. Hidden ids the
 * sidebar doesn't have don't count. `children` are the plugin items' children,
 * by item id, so a pick that matches the plugin's defaults counts as no pick.
 */
export function sameSidebar(
	defaults: string[],
	a: SidebarLayout,
	b: SidebarLayout,
	children: Record<string, ShortcutChild[]> = {},
): boolean {
	if (!sameIds(resolveSidebarOrder(defaults, a.order), resolveSidebarOrder(defaults, b.order))) return false;
	if (!sameIds(defaults.filter((id) => a.hidden.includes(id)), defaults.filter((id) => b.hidden.includes(id)))) return false;
	return Object.entries(children).every(([item, list]) =>
		sameIds(shownShortcuts(a.shortcuts, item, list), shownShortcuts(b.shortcuts, item, list)));
}
