/**
 * URLs of the API's same-origin module route for plugin and theme web
 * components (see plugin-modules.ts). Kept free of stores so it can be tested
 * on its own.
 */

export type PluginModuleType = 'page' | 'widget' | 'panel' | 'modal' | 'report' | 'field';

export interface PluginModule {
	type: PluginModuleType;
	/** Plugin slug, or theme slug for a theme's field. */
	slug: string;
	/** File name under `admin-next/<type>s/`, for modal, report and field modules. */
	name?: string;
	/** `themes` for a field a theme provides. */
	kind?: 'plugins' | 'themes';
	/** The custom element tag the module defines. */
	tag: string;
	/** The module's version (`v`) from its registry entry, when it has one. */
	version?: string | null;
}

/**
 * `{apiBase}/admin-next/modules/{kind}/{slug}/{type}[/{name}]?tag=…[&v=…]`,
 * where `apiBase` is the server URL plus the API prefix (`/api/v1`).
 */
export function pluginModuleUrl(apiBase: string, m: PluginModule): string {
	const segments = [m.kind ?? 'plugins', m.slug, m.type];
	if (m.name) segments.push(m.name);
	const params = new URLSearchParams({ tag: m.tag });
	if (m.version) params.set('v', m.version);
	const path = segments.map(encodeURIComponent).join('/');
	return `${apiBase}/admin-next/modules/${path}?${params}`;
}

/**
 * The plugin behind a dashboard widget's `scriptUrl`, when it is the plugin's
 * own widget script (`/gpm/plugins/{slug}/widget-script`, what every plugin
 * registers). Null for anything else.
 */
export function widgetScriptModule(scriptUrl: string): { slug: string } | null {
	const match = /^\/gpm\/plugins\/([^/?#]+)\/widget-script$/.exec(scriptUrl);
	return match ? { slug: decodeURIComponent(match[1]) } : null;
}
