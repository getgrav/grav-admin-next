/**
 * Global dialog store for confirm/alert prompts.
 *
 * Replaces native `window.confirm()` / `window.alert()` with the
 * admin-next ConfirmModal. Svelte components should call
 * `dialogs.confirm(...)`; plugin web components should call
 * `window.__GRAV_DIALOGS.confirm(...)`, which is wired up in
 * the root layout.
 */

export interface ConfirmOptions {
	title?: string;
	message: string;
	/** Optional list of items rendered beneath the message (e.g. the packages about to be updated). */
	items?: string[];
	confirmLabel?: string;
	cancelLabel?: string;
	variant?: 'destructive' | 'default';
}

/**
 * Note the optional title/confirmLabel/cancelLabel: they are deliberately left
 * `undefined` when the caller omits them, so ConfirmModal's own `i18n.t(...)`
 * prop defaults apply. Filling in English here instead ('Are you sure?',
 * 'Confirm', 'Cancel') made those defaults unreachable — GlobalDialogs passes
 * every prop through explicitly, so a value was always present — which left the
 * three most common dialog labels permanently untranslated, including for
 * plugin authors calling window.__GRAV_DIALOGS.confirm().
 */
interface PendingDialog extends Omit<ConfirmOptions, 'variant'> {
	message: string;
	items: string[];
	variant: 'destructive' | 'default';
	resolve: (value: boolean) => void;
}

let current = $state<PendingDialog | null>(null);

export const dialogs = {
	get current() {
		return current;
	},

	confirm(options: ConfirmOptions): Promise<boolean> {
		return new Promise<boolean>((resolve) => {
			// If a dialog is already open, auto-cancel it so the new one takes over.
			if (current) {
				current.resolve(false);
			}
			current = {
				title: options.title,
				message: options.message,
				items: options.items ?? [],
				confirmLabel: options.confirmLabel,
				cancelLabel: options.cancelLabel,
				variant: options.variant ?? 'default',
				resolve,
			};
		});
	},

	accept() {
		if (!current) return;
		const r = current.resolve;
		current = null;
		r(true);
	},

	dismiss() {
		if (!current) return;
		const r = current.resolve;
		current = null;
		r(false);
	},
};
