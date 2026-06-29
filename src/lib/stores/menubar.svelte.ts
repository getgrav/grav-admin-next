import { getMenubarItems, type MenubarItem, type MenubarPlacement } from '$lib/api/endpoints/menubar';
import { invalidations } from './invalidation.svelte';

/**
 * Shared menubar-items store. The toolbar renders plugin buttons in two zones
 * (a `start` zone in the open space on the left, and an `end` zone beside the
 * core actions — see admin2#81), so the items are fetched once here and split
 * per zone, rather than each zone component fetching its own copy.
 */
function createMenubarStore() {
	let items = $state<MenubarItem[]>([]);
	let loaded = $state(false);

	async function load() {
		try {
			items = await getMenubarItems();
			loaded = true;
		} catch {
			// Silently fail — the menubar is non-critical.
		}
	}

	// Reload when a plugin/theme is installed/removed/enabled/disabled. A single
	// API response can emit multiple tags (e.g. `plugins:create:foo,
	// plugins:list, gpm:update`); coalesce them into one reload per burst.
	let reloadScheduled = false;
	function scheduleReload() {
		if (reloadScheduled) return;
		reloadScheduled = true;
		queueMicrotask(() => {
			reloadScheduled = false;
			load();
		});
	}

	if (typeof window !== 'undefined') {
		invalidations.subscribe('plugins:*', scheduleReload);
		invalidations.subscribe('themes:*', scheduleReload);
		invalidations.subscribe('gpm:*', scheduleReload);
	}

	// Items for one zone, ordered by `priority` (higher first; ties keep plugin
	// registration order via the stable sort). Items without a `placement`
	// default to `start` so existing plugin buttons land in the open left space
	// rather than crowding the destructive Clear Cache action.
	function forPlacement(placement: MenubarPlacement): MenubarItem[] {
		return items
			.filter((item) => (item.placement ?? 'start') === placement)
			.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
	}

	return {
		get items() { return items; },
		get loaded() { return loaded; },
		load,
		forPlacement,
	};
}

export const menubar = createMenubarStore();
