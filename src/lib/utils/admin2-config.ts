/**
 * Admin2 plugin settings the PHP wrapper hands the SPA in
 * `window.__GRAV_CONFIG__` (see admin2.php). The shell HTML is served once per
 * full page load, so a changed setting takes effect on the next reload.
 */
interface Admin2BootConfig {
	pages?: { only_editable?: unknown };
}

function bootConfig(): Admin2BootConfig | undefined {
	if (typeof window === 'undefined') return undefined;
	return (window as unknown as { __GRAV_CONFIG__?: Admin2BootConfig }).__GRAV_CONFIG__;
}

/**
 * `plugins.admin2.pages.only_editable`: list only the pages the user can
 * update, plus the folders leading to them (admin2#209). A convenience for
 * editors who look after a few pages of a large site, not an access control:
 * the API still decides what each user may read and change.
 */
export function onlyEditablePages(): boolean {
	return bootConfig()?.pages?.only_editable === true;
}
