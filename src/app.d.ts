// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	// Globals exposed to custom field/page web components
	interface Window {
		__GRAV_FIELD_TAG: string;
		__GRAV_PAGE_TAG: string;
		__GRAV_API_SERVER_URL: string;
		__GRAV_API_PREFIX: string;
		__GRAV_API_TOKEN: string | null;
		/** The environment picker's selection, `default` for base config; sent as X-Grav-Environment and X-Config-Environment on a plugin's own API calls. */
		__GRAV_ENVIRONMENT: string;
		__GRAV_PAGE_ROUTE: string;
		/**
		 * Live page media snapshot for web components (editor-pro's image picker).
		 * Absolute `thumb` URL plus alt/title from each file's metadata.
		 */
		__GRAV_PAGE_MEDIA?: () => Array<{
			filename: string;
			type: string;
			thumb: string | undefined;
			url: string | undefined;
			alt: string;
			title: string;
		}>;
		/**
		 * Open the site-media picker (folder browser). Resolves the chosen image
		 * as a `media://` markdown url, an absolute display url, and its alt text,
		 * or null if cancelled. Used by editor-pro's image insert.
		 */
		__GRAV_MEDIA_PICKER?: () => Promise<{ url: string; display: string; alt: string } | null>;
		__GRAV_CONTENT_LANG: string;
		__GRAV_PAGE_LOADING: Record<string, Promise<void> | undefined>;
		__GRAV_FIELD_LOADING: Record<string, Promise<void> | undefined>;
		__GRAV_PANEL_TAG: string;
		__GRAV_PANEL_LOADING: Record<string, Promise<void> | undefined>;
		__GRAV_MODAL_TAG: string;
		__GRAV_MODAL_LOADING: Record<string, Promise<void> | undefined>;
		__GRAV_DIALOGS: {
			confirm: (options: {
				title?: string;
				message: string;
				confirmLabel?: string;
				cancelLabel?: string;
				variant?: 'destructive' | 'default';
			}) => Promise<boolean>;
			/**
			 * Open a form modal built from inline field definitions. Resolves the
			 * entered values keyed by field name, or `null` if cancelled.
			 */
			form: (options: {
				title?: string;
				description?: string;
				fields: Array<{
					name: string;
					type?: 'text' | 'textarea' | 'select' | 'toggle' | 'number';
					label?: string;
					placeholder?: string;
					help?: string;
					required?: boolean;
					value?: string | number | boolean;
					options?: Array<{ value: string; label: string }>;
				}>;
				submitLabel?: string;
				cancelLabel?: string;
				size?: 'sm' | 'md' | 'lg' | 'xl';
			}) => Promise<Record<string, unknown> | null>;
			/**
			 * Mount a plugin's own modal web component
			 * (`grav-{plugin}--modal-{component}`, served from
			 * `admin-next/modals/{component}.js`). Resolves whatever the component
			 * reports via its `resolve` event, or `null` on cancel/close.
			 */
			open: (options: {
				kind?: 'component';
				title?: string;
				plugin: string;
				component: string;
				props?: Record<string, unknown>;
				size?: 'sm' | 'md' | 'lg' | 'xl';
				useStandardHeader?: boolean;
			}) => Promise<unknown>;
		};
		__GRAV_TOAST: {
			success: (message: string, options?: Record<string, unknown>) => void;
			error: (message: string, options?: Record<string, unknown>) => void;
			info: (message: string, options?: Record<string, unknown>) => void;
			warning: (message: string, options?: Record<string, unknown>) => void;
		};
		__GRAV_ADMIN_BASE: string;
		__GRAV_NAVIGATE: (
			url: string,
			opts?: { replaceState?: boolean; noScroll?: boolean; keepFocus?: boolean; invalidateAll?: boolean }
		) => Promise<void>;
	}
}

export {};
