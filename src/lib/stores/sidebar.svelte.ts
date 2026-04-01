/**
 * Reactive store for plugin-provided sidebar navigation items.
 *
 * Loaded once on authentication; plugin sidebar items are appended
 * below the core navigation in AppShell.
 */

import { getSidebarItems, type SidebarItem } from '$lib/api/endpoints/sidebar';

let pluginItems = $state<SidebarItem[]>([]);
let loaded = $state(false);

export const sidebarStore = {
	get items() { return pluginItems; },
	get loaded() { return loaded; },

	async load() {
		try {
			const items = await getSidebarItems();
			pluginItems = items.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
			loaded = true;
		} catch {
			// Non-critical — sidebar still shows core items
		}
	},

	clear() {
		pluginItems = [];
		loaded = false;
	},
};
