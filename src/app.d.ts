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
		__GRAV_PAGE_ROUTE: string;
		__GRAV_CONTENT_LANG: string;
		__GRAV_PAGE_LOADING: Record<string, Promise<void> | undefined>;
		__GRAV_FIELD_LOADING: Record<string, Promise<void> | undefined>;
		__GRAV_PANEL_TAG: string;
		__GRAV_PANEL_LOADING: Record<string, Promise<void> | undefined>;
	}
}

export {};
