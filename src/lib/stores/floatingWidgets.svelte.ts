/**
 * Reactive store for plugin-provided floating widgets.
 *
 * Loaded once on authentication; widgets are rendered as persistent
 * UI elements (FAB buttons + panels) in the AppShell.
 */

import { getFloatingWidgets, type FloatingWidget } from '$lib/api/endpoints/floatingWidgets';

let widgets = $state<FloatingWidget[]>([]);
let loaded = $state(false);

export const floatingWidgetStore = {
	get items() { return widgets; },
	get loaded() { return loaded; },

	async load() {
		try {
			const items = await getFloatingWidgets();
			widgets = items.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
			loaded = true;
		} catch {
			// Non-critical — app works without floating widgets
		}
	},

	clear() {
		widgets = [];
		loaded = false;
	},
};
