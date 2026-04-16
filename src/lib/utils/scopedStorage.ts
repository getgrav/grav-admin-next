/**
 * Scope a localStorage/sessionStorage key to the current Grav site so that
 * multiple Grav installs on the same browser origin (e.g. localhost/site-a
 * vs localhost/site-b) don't clobber each other's persisted state.
 *
 * Scope is derived from __GRAV_CONFIG__.basePath, which is injected into the
 * SPA by admin2 on every request and is unique per site. Falls back to
 * serverUrl, and finally to empty (no scoping) when running outside admin2.
 */

interface GravConfig {
	basePath?: string;
	serverUrl?: string;
}

function getScope(): string {
	if (typeof window === 'undefined') {
		return '';
	}
	const cfg = (window as unknown as { __GRAV_CONFIG__?: GravConfig }).__GRAV_CONFIG__;
	return cfg?.basePath || cfg?.serverUrl || '';
}

export function scopedKey(base: string): string {
	const scope = getScope();
	return scope ? `${base}::${scope}` : base;
}
