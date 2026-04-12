import { auth } from '$lib/stores/auth.svelte';

/**
 * Check if the current user has a specific permission.
 *
 * Super admins always return true. For other users, looks up the permission
 * key in the flat resolved access map from the API (GET /me).
 *
 * Because auth.isSuperAdmin and auth.access are backed by $state, calling
 * can() inside a $derived block will track reactively.
 */
export function can(permission: string): boolean {
	if (auth.isSuperAdmin) return true;
	return auth.access[permission] === true;
}

/**
 * Convenience: check if the current user can write to a section.
 */
export function canWrite(section: 'config' | 'pages' | 'users' | 'media' | 'gpm' | 'system'): boolean {
	const map: Record<string, string> = {
		config: 'api.config.write',
		pages: 'api.pages.write',
		users: 'api.users.write',
		media: 'api.media.write',
		gpm: 'api.gpm.write',
		system: 'api.system.write',
	};
	return can(map[section]);
}
