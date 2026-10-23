/**
 * The shortcuts under plugin sidebar items, for the plugins themselves
 * (`window.__GRAV_SIDEBAR`): a plugin's own page can show which of its screens
 * are starred and star or unstar one, saved to the user's sidebar layout like
 * a change made with the sidebar's pencil.
 */

import { prefs } from './preferences.svelte';
import { sidebarStore } from './sidebar.svelte';
import { flushNow } from './_serverSync';
import { PLUGIN_PREFIX, asSidebarLayout, shownShortcuts, withShortcut } from '$lib/utils/sidebar-layout';

function childrenOf(itemId: string) {
	return sidebarStore.items.find((item) => item.id === itemId)?.children ?? [];
}

/** The ids of every shortcut a plugin's sidebar item offers this user (its own id, not `plugin:<id>`). */
export function sidebarChildren(itemId: string): string[] {
	return childrenOf(itemId).map((c) => c.id);
}

/** The ids of the shortcuts showing under a plugin's sidebar item. */
export function sidebarShortcuts(itemId: string): string[] {
	return shownShortcuts(asSidebarLayout(prefs.sidebarLayout).shortcuts, PLUGIN_PREFIX + itemId, childrenOf(itemId));
}

/** Every plugin item's showing shortcuts, by item id, for the change event. */
export function allSidebarShortcuts(): Record<string, string[]> {
	const out: Record<string, string[]> = {};
	for (const item of sidebarStore.items) {
		if (item.children?.length) out[item.id] = sidebarShortcuts(item.id);
	}
	return out;
}

/**
 * Star or unstar one shortcut. A child the item doesn't offer this user is
 * ignored, so a plugin can't fill the layout with ids the sidebar can't draw.
 */
export async function setSidebarShortcut(itemId: string, childId: string, on: boolean): Promise<void> {
	const children = childrenOf(itemId);
	if (!children.some((c) => c.id === childId)) return;
	if (sidebarShortcuts(itemId).includes(childId) === on) return;
	const layout = asSidebarLayout(prefs.sidebarLayout);
	prefs.sidebarLayout = { ...layout, shortcuts: withShortcut(layout.shortcuts, PLUGIN_PREFIX + itemId, children, childId, on) };
	await flushNow();
}
