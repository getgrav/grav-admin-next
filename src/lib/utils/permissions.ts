import { auth } from '$lib/stores/auth.svelte';
import type { PagePermissions } from '$lib/api/endpoints/pages';

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
 *
 * In demo mode the account browses with (typically super-admin) read access but
 * may only write the resources in the server's demo `writable` allowlist. This
 * gate is layered on top of the real permission check, so with the default
 * allowlist pages/media stay writable while config/users/gpm/system grey out.
 * Purely a UX affordance — the server enforces the same block and returns 403.
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
	const permission = map[section];
	if (!can(permission)) return false;
	if (auth.demoMode && !auth.demoWritable.includes(permission)) return false;
	return true;
}

/**
 * Whether the user may perform a CRUD action on ONE specific page.
 *
 * A page can carry its own rules in `header.permissions`, which the API
 * resolves per user and returns as `page.permissions` (admin2#150). Those rules
 * override the account-wide permission in both directions — they can grant
 * update/delete on a page to someone without `api.pages.write`, and deny it to
 * someone who has it — so a page-level answer always wins when present.
 *
 * `page` may be undefined (still loading) or come from an older API that
 * doesn't send `permissions`; both fall back to the account-wide check, which
 * is exactly how the admin behaved before per-page rules were enforced.
 */
export function pageCan(
	page: { permissions?: PagePermissions } | null | undefined,
	action: keyof PagePermissions,
): boolean {
	const isRead = action === 'read' || action === 'list';
	const permissions = page?.permissions;

	if (!permissions || typeof permissions[action] !== 'boolean') {
		return isRead ? can('api.pages.read') : canWrite('pages');
	}

	// Demo mode still wins over a page grant — the server caps it the same way.
	if (permissions[action] && !isRead && auth.demoMode && !auth.demoWritable.includes('api.pages.write')) {
		return false;
	}

	return permissions[action];
}
