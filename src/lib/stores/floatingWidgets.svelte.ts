/**
 * Reactive store for plugin-provided floating widgets.
 *
 * Loaded once on authentication; widgets are rendered as persistent
 * UI elements (FAB buttons + panels) in the AppShell.
 */

import { getFloatingWidgets, type FloatingWidget } from '$lib/api/endpoints/floatingWidgets';
import { takeBootPart } from './boot';

let widgets = $state<FloatingWidget[]>([]);
let loaded = $state(false);

export const floatingWidgetStore = {
	get items() { return widgets; },
	get loaded() { return loaded; },

	/** `fromBoot` takes the items from the boot request when it has them. */
	async load(fromBoot = false) {
		try {
			const boot = fromBoot ? await takeBootPart<FloatingWidget[]>('floating_widgets') : null;
			const items = boot ? boot.value : await getFloatingWidgets();
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
