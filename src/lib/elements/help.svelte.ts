/**
 * `<grav-help>` — help text for a plugin's own form, drawn the way the admin's
 * Help text setting says.
 *
 * The shell registers this once at boot, next to `<grav-blueprint-form>`. A
 * plugin page that draws its own fields puts its help inside it:
 *
 *     <label>Store name <grav-help>Shown on receipts. <a href="…">More</a></grav-help></label>
 *
 * With the setting on "Below the label" the help is a small paragraph; with "In
 * a tooltip" it is the same info icon core fields use. It works inside any
 * shadow root, because it draws itself in a shadow root of its own and takes its
 * colours from the admin's custom properties. See docs/help-element.md.
 */
import { mount, unmount } from 'svelte';
import GravHelp from './GravHelp.svelte';
import helpTipCss from '$lib/components/ui/help-tip.css?inline';
import helpCss from './help.css?inline';

export const HELP_TAG = 'grav-help';

// One stylesheet for every element, where the browser allows it.
let sheet: CSSStyleSheet | null | undefined;
function sharedSheet(): CSSStyleSheet | null {
	if (sheet !== undefined) return sheet;
	try {
		sheet = new CSSStyleSheet();
		sheet.replaceSync(`${helpTipCss}\n${helpCss}`);
	} catch {
		sheet = null;
	}
	return sheet;
}

class GravHelpElement extends HTMLElement {
	static get observedAttributes() {
		return ['label'];
	}

	#props = $state({ host: this as HTMLElement, label: '' });
	#app: Record<string, unknown> | null = null;

	connectedCallback() {
		if (this.#app) return;
		const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
		const shared = sharedSheet();
		if (shared) {
			if (!root.adoptedStyleSheets.includes(shared)) root.adoptedStyleSheets = [...root.adoptedStyleSheets, shared];
		} else if (!root.querySelector('style')) {
			const style = document.createElement('style');
			style.textContent = `${helpTipCss}\n${helpCss}`;
			root.prepend(style);
		}
		this.#app = mount(GravHelp, { target: root, props: this.#props });
	}

	disconnectedCallback() {
		const app = this.#app;
		this.#app = null;
		if (app) unmount(app);
	}

	attributeChangedCallback(name: string, _old: string | null, value: string | null) {
		if (name === 'label') this.#props.label = (value ?? '').trim();
	}

	/** Names the info icon for screen readers, when it can't be worked out from the surrounding label. */
	get label(): string {
		return this.#props.label;
	}
	set label(value: string) {
		this.setAttribute('label', value ?? '');
	}
}

/**
 * Register the element. Safe to call more than once — a second call with the
 * tag already taken does nothing.
 */
export function defineHelpElement(): void {
	if (typeof window === 'undefined' || typeof customElements === 'undefined') return;
	if (customElements.get(HELP_TAG)) return;
	customElements.define(HELP_TAG, GravHelpElement);
}
