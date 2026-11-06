/**
 * Loads the web components plugins (and, for fields, themes) ship under
 * `admin-next/`: plugin pages, custom fields, dashboard and floating widgets,
 * context panels, modals and reports.
 *
 * Each one is imported straight from the API's same-origin module route,
 * `/admin-next/modules/{kind}/{slug}/{type}[/{name}]?tag=…&v=…`, which puts the
 * line that tells the module its element tag (`window.__GRAV_PAGE_TAG = …;`
 * and so on) in front of the file. Admin2 used to fetch the code with its
 * token, prepend that line itself and import it from a `blob:` URL; a strict
 * Content-Security-Policy can't allow that without allowing any script the
 * page builds (admin2#212). `v` comes from the registry payload that named the
 * module and makes the URL cacheable for a year; without one the browser
 * revalidates the module once per page load.
 */
import { auth } from '$lib/stores/auth.svelte';
import { pluginModuleUrl, type PluginModule } from './plugin-module-url';

export { widgetScriptModule, type PluginModule, type PluginModuleType } from './plugin-module-url';

/** One in-flight load per element tag, shared by every caller. */
const loading: Record<string, Promise<void> | undefined> = {};

/**
 * Hand plugin components the auth context they read for their own API calls.
 * Refreshed on every load and mount, since the token rotates.
 */
export function syncPluginGlobals(): void {
	window.__GRAV_API_SERVER_URL = auth.serverUrl;
	window.__GRAV_API_PREFIX = auth.apiPrefix || '/api/v1';
	window.__GRAV_API_TOKEN = auth.accessToken;
}

/**
 * Import a plugin web component and wait until its element is defined.
 * Resolves at once when the tag is already defined; a failed load can be
 * retried.
 */
export function loadPluginModule(m: PluginModule): Promise<void> {
	syncPluginGlobals();
	if (customElements.get(m.tag)) return Promise.resolve();

	const existing = loading[m.tag];
	if (existing) return existing;

	const promise = (async () => {
		await import(/* @vite-ignore */ pluginModuleUrl(`${auth.serverUrl}${auth.apiPrefix || '/api/v1'}`, m));
		await customElements.whenDefined(m.tag);
	})();
	loading[m.tag] = promise;
	promise.catch(() => {
		if (loading[m.tag] === promise) delete loading[m.tag];
	});
	return promise;
}
