/**
 * `<grav-blueprint-form>` — the admin's own settings form, as a custom element.
 *
 * The shell registers this once at boot. Any plugin page written as a web
 * component can then put its plugin's settings on one of its own screens
 * instead of sending people out to /plugins/<slug>:
 *
 *     <grav-blueprint-form plugin="kahunacart" filter="tax"></grav-blueprint-form>
 *
 * It loads the package's config blueprint and current values, renders the real
 * admin fields, and saves through the same endpoint with the same validation as
 * the settings page. See docs/blueprint-form-element.md.
 */
import { mount, unmount } from 'svelte';
import EmbeddedConfigForm from '$lib/components/blueprint/EmbeddedConfigForm.svelte';

export const BLUEPRINT_FORM_TAG = 'grav-blueprint-form';

interface FormExports {
	save: () => Promise<boolean>;
	reload: () => Promise<void>;
	isDirty: () => boolean;
}

class GravBlueprintForm extends HTMLElement {
	static get observedAttributes() {
		return ['plugin', 'theme', 'filter', 'hide-toolbar', 'hide-fields'];
	}

	#props = $state({
		kind: 'plugins' as 'plugins' | 'themes',
		slug: '',
		filter: '',
		hideToolbar: false,
		hideFields: [] as string[],
		onevent: (name: string, detail: Record<string, unknown>) => this.#emit(name, detail),
	});

	#form: FormExports | null = null;

	#emit(name: string, detail: Record<string, unknown>) {
		this.dispatchEvent(new CustomEvent(`blueprint-${name}`, {
			detail,
			bubbles: true,
			composed: true,
		}));
	}

	connectedCallback() {
		if (this.#form) return;
		// Light DOM on purpose: the fields are styled by the admin's own
		// stylesheet, and a shadow root would cut them off from it. A page that
		// draws itself inside a shadow root reaches this element through a
		// `<slot>` — see the docs.
		this.#form = mount(EmbeddedConfigForm, {
			target: this,
			props: this.#props,
		}) as unknown as FormExports;
	}

	disconnectedCallback() {
		const form = this.#form;
		this.#form = null;
		if (form) unmount(form as never);
		this.innerHTML = '';
	}

	attributeChangedCallback(name: string, _old: string | null, value: string | null) {
		if (name === 'plugin') {
			this.#props.kind = 'plugins';
			this.#props.slug = value ?? '';
		} else if (name === 'theme') {
			this.#props.kind = 'themes';
			this.#props.slug = value ?? '';
		} else if (name === 'filter') {
			this.#props.filter = value ?? '';
		} else if (name === 'hide-toolbar') {
			this.#props.hideToolbar = value !== null && value !== 'false';
		} else if (name === 'hide-fields') {
			this.#props.hideFields = (value ?? '')
				.split(',')
				.map((n) => n.trim())
				.filter((n) => n !== '');
		}
	}

	/** The plugin slug this form is editing. */
	get plugin(): string {
		return this.#props.kind === 'plugins' ? this.#props.slug : '';
	}
	set plugin(value: string) {
		this.setAttribute('plugin', value ?? '');
	}

	/** The theme slug this form is editing. */
	get theme(): string {
		return this.#props.kind === 'themes' ? this.#props.slug : '';
	}
	set theme(value: string) {
		this.setAttribute('theme', value ?? '');
	}

	/** Hide every field that does not match this text. */
	get filter(): string {
		return this.#props.filter;
	}
	set filter(value: string) {
		this.setAttribute('filter', value ?? '');
	}

	/** Blueprint field names this host does not want drawn, comma separated. */
	get hideFields(): string[] {
		return this.#props.hideFields;
	}
	set hideFields(value: string[] | string) {
		this.setAttribute('hide-fields', Array.isArray(value) ? value.join(',') : String(value ?? ''));
	}

	/** True while the form holds changes nobody has saved. */
	get dirty(): boolean {
		return this.#form ? this.#form.isDirty() : false;
	}

	/** Save the form. Resolves true when the settings were written. */
	save(): Promise<boolean> {
		return this.#form ? this.#form.save() : Promise.resolve(false);
	}

	/** Throw away what is on screen and read the settings again. */
	reload(): Promise<void> {
		return this.#form ? this.#form.reload() : Promise.resolve();
	}
}

/**
 * Register the element. Safe to call more than once — a second call with the
 * tag already taken does nothing.
 */
export function defineBlueprintFormElement(): void {
	if (typeof window === 'undefined' || typeof customElements === 'undefined') return;
	if (customElements.get(BLUEPRINT_FORM_TAG)) return;
	customElements.define(BLUEPRINT_FORM_TAG, GravBlueprintForm);
}
