/**
 * Reactive store for plugin-provided sidebar navigation items.
 *
 * Loaded once on authentication; plugin sidebar items are appended
 * below the core navigation in AppShell.
 */

import { api } from '$lib/api/client';
import { getSidebarItems, type SidebarItem } from '$lib/api/endpoints/sidebar';

let pluginItems = $state<SidebarItem[]>([]);
let loaded = $state(false);
// Live badge counts keyed by item id, fetched from each item's `badgeEndpoint`.
// These override the static `badge` value when present.
let badges = $state<Record<string, number>>({});

export const sidebarStore = {
	get items() { return pluginItems; },
	get loaded() { return loaded; },
	get badges() { return badges; },

	async load() {
		try {
			const items = await getSidebarItems();
			pluginItems = items.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
			loaded = true;
		} catch {
			// Non-critical — sidebar still shows core items
		}
	},

	/** Fetch live counts for every item that declares a `badgeEndpoint`. */
	async fetchBadges() {
		for (const item of pluginItems) {
			if (!item.badgeEndpoint) continue;
			try {
				const result = await api.get<{ count: number }>(item.badgeEndpoint);
				this.setBadge(item.id, result.count);
			} catch {
				// Badge fetch failure is non-critical
			}
		}
	},

	setBadge(id: string, count: number) {
		badges = { ...badges, [id]: count };
	},

	clear() {
		pluginItems = [];
		loaded = false;
		badges = {};
	},
};
