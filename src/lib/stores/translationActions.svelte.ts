/**
 * Plugin actions for the page editor's Translations panel.
 *
 * A plugin registers an action once (usually from an auto-loaded widget
 * script) through `window.__GRAV_TRANSLATION_ACTIONS.register()`. The page
 * editor lists every visible action under the page's translations, and calls
 * `run()` with the page and language it was clicked on. ai-translate uses it
 * for "Translate with AI…"; any plugin offering translation services can do
 * the same without Admin2 knowing about it.
 *
 * Registration lives here, outside the editor, because widget scripts load
 * once at boot and can run before or after any page editor mounts.
 */

export interface TranslationActionContext {
	/** Page route being edited. */
	route: string;
	/** Content language being edited. */
	lang: string;
	/** The site's default language. */
	defaultLang: string;
	/** Languages this page has a file for. */
	translatedLanguages: string[];
	/** Languages this page has no file for yet. */
	untranslatedLanguages: string[];
	/** True when the editor shows another language's file as a stand-in. */
	isFallback: boolean;
}

export interface TranslationAction {
	/** Unique id; registering the same id again replaces the action. */
	id: string;
	/** Button text. */
	label: string;
	/** Font Awesome icon (`fa-language`, `language`, `fa-solid fa-robot`). */
	icon?: string;
	/** Tooltip. */
	title?: string;
	/** Hide the action for some pages or languages. Shown when omitted. */
	visible?: (ctx: TranslationActionContext) => boolean;
	run: (ctx: TranslationActionContext) => unknown;
}

let items = $state<TranslationAction[]>([]);

export const translationActions = {
	get items() {
		return items;
	},
	register(action: TranslationAction) {
		if (!action || typeof action.id !== 'string' || typeof action.run !== 'function') return;
		items = [...items.filter((a) => a.id !== action.id), action];
	},
	unregister(id: string) {
		items = items.filter((a) => a.id !== id);
	},
	/** Actions to show for a page, with plugin errors kept out of the editor. */
	visibleFor(ctx: TranslationActionContext): TranslationAction[] {
		return items.filter((a) => {
			try {
				return a.visible ? a.visible(ctx) !== false : true;
			} catch {
				return false;
			}
		});
	},
};
