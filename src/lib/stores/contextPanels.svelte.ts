/**
 * Reactive store for plugin-provided context panels.
 *
 * Context panels are slide-in panels triggered by toolbar buttons.
 * They provide contextual information about the current page/config
 * (e.g., revision history, activity log).
 *
 * Loaded once on authentication; trigger buttons rendered in matching contexts.
 */

import { getContextPanels, type ContextPanel } from '$lib/api/endpoints/contextPanels';

export interface PanelContext {
	route: string;
	lang: string;
	type: string; // e.g. 'pages', 'config'
}

let panels = $state<ContextPanel[]>([]);
let loaded = $state(false);
let activePanel = $state<string | null>(null);
let panelContext = $state<PanelContext | null>(null);
let badges = $state<Record<string, number>>({});

export const contextPanelStore = {
	get items() { return panels; },
	get loaded() { return loaded; },
	get activePanel() { return activePanel; },
	get context() { return panelContext; },
	get badges() { return badges; },

	async load() {
		try {
			const items = await getContextPanels();
			panels = items.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
			loaded = true;
		} catch {
			// Non-critical — app works without context panels
		}
	},

	clear() {
		panels = [];
		loaded = false;
		activePanel = null;
		panelContext = null;
		badges = {};
	},

	open(panelId: string, context: PanelContext) {
		activePanel = panelId;
		panelContext = context;
	},

	close() {
		activePanel = null;
		panelContext = null;
	},

	toggle(panelId: string, context: PanelContext) {
		if (activePanel === panelId) {
			activePanel = null;
			panelContext = null;
		} else {
			activePanel = panelId;
			panelContext = context;
		}
	},

	setBadge(panelId: string, count: number) {
		badges = { ...badges, [panelId]: count };
	},

	clearBadges() {
		badges = {};
	},

	/** Get panels registered for a specific context. */
	forContext(context: string): ContextPanel[] {
		return panels.filter(p => p.contexts.includes(context));
	},

	/** Get a panel by ID. */
	getPanel(id: string): ContextPanel | undefined {
		return panels.find(p => p.id === id);
	},
};
