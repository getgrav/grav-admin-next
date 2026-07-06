/**
 * Global site-media picker store.
 *
 * Opens a modal that browses the site media library (folders + images) and
 * resolves the chosen file as a `media://` markdown URL plus an absolute
 * display URL. Svelte code calls `mediaPicker.open()`; plugin web components
 * (editor-pro) reach it through `window.__GRAV_MEDIA_PICKER()`, wired up in the
 * root layout. Only one picker is shown at a time.
 */

export interface MediaPickResult {
	/** `media://path/file.ext` — what goes in the markdown. */
	url: string;
	/** Absolute URL for editors that need a real src to preview. */
	display: string;
	/** Resolved alt text (metadata alt → title → filename). */
	alt: string;
}

interface PendingPicker {
	resolve: (value: MediaPickResult | null) => void;
}

let current = $state<PendingPicker | null>(null);

export const mediaPicker = {
	get open_() {
		return current !== null;
	},

	open(): Promise<MediaPickResult | null> {
		return new Promise((resolve) => {
			// A second open supersedes the first (cancel the old one).
			if (current) current.resolve(null);
			current = { resolve };
		});
	},

	pick(result: MediaPickResult) {
		if (!current) return;
		const r = current.resolve;
		current = null;
		r(result);
	},

	cancel() {
		if (!current) return;
		const r = current.resolve;
		current = null;
		r(null);
	},
};
