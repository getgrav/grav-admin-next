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
 *
 * The element itself is a thin shell so registering it at boot costs nothing:
 * the form, every field type and the editors behind them (CodeMirror, yjs,
 * uppy) load on first use, when an element is actually connected.
 */
import { mount, unmount } from 'svelte';

type FormModule = typeof import('$lib/components/blueprint/EmbeddedConfigForm.svelte');

function loadForm(): Promise<FormModule> {
	return import('$lib/components/blueprint/EmbeddedConfigForm.svelte');
}

export const BLUEPRINT_FORM_TAG = 'grav-blueprint-form';

interface FormExports {
	save: () => Promise<boolean>;
	reload: () => Promise<void>;
	isDirty: () => boolean;
}

class GravBlueprintForm extends HTMLElement {
	static get observedAttributes() {
		return ['plugin', 'theme', 'filter', 'hide-toolbar', 'hide-fields', 'tab'];
	}

	#props = $state({
		kind: 'plugins' as 'plugins' | 'themes',
		slug: '',
		filter: '',
		hideToolbar: false,
		hideFields: [] as string[],
		tab: '',
		onevent: (name: string, detail: Record<string, unknown>) => this.#emit(name, detail),
	});

	#form: FormExports | null = null;

	/** Settles once the form is mounted (or failed to load); null while disconnected. */
	#ready: Promise<void> | null = null;

	/** Bumped on every disconnect so a slow import can't mount into a detached element. */
	#generation = 0;

	#emit(name: string, detail: Record<string, unknown>) {
		this.dispatchEvent(new CustomEvent(`blueprint-${name}`, {
			detail,
			bubbles: true,
			composed: true,
		}));
	}

	connectedCallback() {
		if (this.#form || this.#ready) return;
		const generation = this.#generation;
		this.#ready = loadForm()
			.then(({ default: EmbeddedConfigForm }) => {
				if (generation !== this.#generation || !this.isConnected || this.#form) return;
				// Light DOM on purpose: the fields are styled by the admin's own
				// stylesheet, and a shadow root would cut them off from it. A page
				// that draws itself inside a shadow root reaches this element
				// through a `<slot>` — see the docs.
				this.#form = mount(EmbeddedConfigForm, {
					target: this,
					props: this.#props,
				}) as unknown as FormExports;
			})
			.catch((err) => {
				console.error(`[${BLUEPRINT_FORM_TAG}] failed to load the form:`, err);
			});
	}

	disconnectedCallback() {
		this.#generation++;
		this.#ready = null;
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
		} else if (name === 'tab') {
			this.#props.tab = (value ?? '').trim();
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

	/**
	 * The tab the form opens on, or switches to when this changes.
	 *
	 * A tab's blueprint name, with or without its `_tab` suffix, so a host
	 * can say `tab="sending"` for a tab named `sending_tab`. It wins over the
	 * tab the form was last left on. The form never reads or writes the page
	 * hash while it is hosted this way: that hash belongs to the host page's
	 * own router.
	 */
	get tab(): string {
		return this.#props.tab;
	}
	set tab(value: string) {
		this.setAttribute('tab', value ?? '');
	}

	/** True while the form holds changes nobody has saved. */
	get dirty(): boolean {
		return this.#form ? this.#form.isDirty() : false;
	}

	/** Save the form. Resolves true when the settings were written. */
	async save(): Promise<boolean> {
		await this.#ready;
		return this.#form ? this.#form.save() : false;
	}

	/** Throw away what is on screen and read the settings again. */
	async reload(): Promise<void> {
		await this.#ready;
		if (this.#form) await this.#form.reload();
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
