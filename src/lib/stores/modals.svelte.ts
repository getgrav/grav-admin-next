/**
 * Global modal store for plugin-facing modals.
 *
 * Sits alongside the simpler confirm dialog (`dialogs.svelte.ts`). Where
 * `dialogs.confirm()` only ever resolves a boolean, a modal hosts richer
 * content and resolves an arbitrary result:
 *
 *   - `kind: 'form'`      — a lightweight form built from inline field
 *                           definitions (no Grav blueprint engine). Resolves
 *                           the entered values, or `null` on cancel.
 *   - `kind: 'component'` — a plugin-provided web component
 *                           (`grav-{plugin}--modal`) mounted inside the modal
 *                           chrome. Resolves whatever the component reports via
 *                           its `resolve` event, or `null` on cancel/close.
 *
 * Svelte code can call `modals.open(...)` directly; plugin web components reach
 * it through `window.__GRAV_DIALOGS.open(...)` / `.form(...)`, wired up in the
 * root layout.
 *
 * Only one modal is shown at a time. Calls made while a modal is already open
 * queue and open in turn as each resolves — a plugin never has its modal
 * silently dropped the way a second `confirm()` cancels the first.
 */

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ModalFormField {
	/** Key the entered value is returned under. */
	name: string;
	type?: 'text' | 'textarea' | 'select' | 'toggle' | 'number';
	label?: string;
	placeholder?: string;
	/** Help text shown beneath the field. */
	help?: string;
	required?: boolean;
	/** Initial value. */
	value?: string | number | boolean;
	/** Options for `type: 'select'`. */
	options?: Array<{ value: string; label: string }>;
}

export interface FormModalOptions {
	kind?: 'form';
	title?: string;
	description?: string;
	fields: ModalFormField[];
	submitLabel?: string;
	cancelLabel?: string;
	size?: ModalSize;
}

export interface ComponentModalOptions {
	kind: 'component';
	title?: string;
	/** Plugin slug providing the modal web component. */
	plugin: string;
	/**
	 * Modal component id — the file `admin-next/modals/{component}.js` and the
	 * custom element `grav-{plugin}--modal-{component}`. A plugin can ship
	 * several distinct modals this way.
	 */
	component: string;
	/** Properties set on the mounted element before it connects. */
	props?: Record<string, unknown>;
	size?: ModalSize;
	/** When false, the plugin component provides its own chrome (no header). */
	useStandardHeader?: boolean;
}

export type ModalOptions = FormModalOptions | ComponentModalOptions;

export interface PendingModal {
	id: number;
	options: ModalOptions;
	resolve: (value: unknown) => void;
}

let current = $state<PendingModal | null>(null);
const queue: PendingModal[] = [];
let nextId = 1;

function settle(value: unknown) {
	if (!current) return;
	const r = current.resolve;
	current = queue.shift() ?? null;
	r(value);
}

export const modals = {
	get current() {
		return current;
	},

	/**
	 * Open a modal. Resolves the modal's result (form values, or a component's
	 * reported value), or `null` if the user cancels/closes it.
	 */
	open(options: ModalOptions): Promise<unknown> {
		return new Promise<unknown>((resolve) => {
			const pending: PendingModal = { id: nextId++, options, resolve };
			if (current) {
				queue.push(pending);
			} else {
				current = pending;
			}
		});
	},

	/** Convenience for an inline-field form modal. */
	form(options: Omit<FormModalOptions, 'kind'>): Promise<Record<string, unknown> | null> {
		return this.open({ ...options, kind: 'form' }) as Promise<Record<string, unknown> | null>;
	},

	/** Resolve the current modal with a value (e.g. form values / component result). */
	resolve(value: unknown) {
		settle(value);
	},

	/** Cancel the current modal — resolves `null`. */
	cancel() {
		settle(null);
	},
};
