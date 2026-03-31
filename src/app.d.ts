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

	// Globals exposed to custom field web components
	interface Window {
		__GRAV_FIELD_TAG: string;
		__GRAV_API_SERVER_URL: string;
		__GRAV_API_PREFIX: string;
	}
}

export {};
