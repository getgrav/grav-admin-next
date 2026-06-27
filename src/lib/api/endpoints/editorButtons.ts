import { api } from '../client';

/**
 * A plugin-contributed button for the default markdown editor toolbar.
 *
 * Plugins register these server-side via the `onApiMarkdownEditorButtons`
 * event (see the API plugin's EditorButtonsController). A button either opens a
 * plugin modal — which builds and inserts content itself, typically by
 * dispatching the `grav:editor:insert-content` window event — or carries an
 * `insert` payload the editor applies directly on click.
 */
export interface EditorToolbarButton {
	id: string;
	plugin: string;
	/** Tooltip / aria-label. */
	label: string;
	/** Inline SVG markup (preferred, matches the toolbar's Lucide icons) or a Font Awesome class. */
	icon?: string;
	/** Open a plugin modal web component (admin-next/modals/{component}.js). */
	modal?: {
		component: string;
		title?: string;
		props?: Record<string, unknown>;
		size?: 'sm' | 'md' | 'lg' | 'xl';
		useStandardHeader?: boolean;
	};
	/** Insert content directly without a modal. */
	insert?: {
		content: string;
		mode?: 'insert-at-cursor' | 'append' | 'replace';
	};
}

let cache: Promise<EditorToolbarButton[]> | null = null;

/**
 * Fetch the plugin-contributed markdown editor toolbar buttons.
 *
 * Cached for the session — the editor mounts once per markdown field and the
 * button set only changes when plugins are enabled/disabled (a full reload).
 * Call `clearEditorButtonsCache()` to force a refresh.
 */
export async function getEditorButtons(): Promise<EditorToolbarButton[]> {
	if (!cache) {
		cache = api.get<EditorToolbarButton[]>('/editor/toolbar-buttons').catch(() => {
			// Non-critical — a failed fetch just means no plugin buttons this session.
			cache = null;
			return [];
		});
	}
	return cache;
}

export function clearEditorButtonsCache(): void {
	cache = null;
}
