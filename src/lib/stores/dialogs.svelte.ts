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
	confirmLabel?: string;
	cancelLabel?: string;
	variant?: 'destructive' | 'default';
}

interface PendingDialog extends Required<Omit<ConfirmOptions, 'variant'>> {
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
				title: options.title ?? 'Are you sure?',
				message: options.message,
				confirmLabel: options.confirmLabel ?? 'Confirm',
				cancelLabel: options.cancelLabel ?? 'Cancel',
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
