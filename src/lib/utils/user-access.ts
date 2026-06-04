import type { UserInfo } from '$lib/api/endpoints/users';
import type { PermissionAction } from '$lib/api/endpoints/blueprints';

export interface AccessFilterOption {
	value: string;
	label: string;
	hint?: string;
}

/**
 * Helpers for introspecting a *listed* user's access map (the `access` tree
 * returned per row by GET /users), as opposed to utils/permissions.ts which
 * answers questions about the *current* logged-in user.
 *
 * These look only at a user's direct `access` grants — group-inherited
 * permissions aren't resolvable client-side. The authoritative, group-aware
 * check lives server-side behind the ?access= filter on GET /users; these are
 * for at-a-glance badges in the list/table.
 */

/**
 * Flatten a nested access object into dot-notation keys whose value is `true`.
 * `{ api: { super: true }, site: { login: true } }` → `['api.super', 'site.login']`.
 */
export function flattenAccess(access: Record<string, unknown> | null | undefined, prefix = ''): string[] {
	const result: string[] = [];
	if (!access || typeof access !== 'object') return result;
	for (const [key, value] of Object.entries(access)) {
		const path = prefix ? `${prefix}.${key}` : key;
		if (value === true) {
			result.push(path);
		} else if (value && typeof value === 'object') {
			result.push(...flattenAccess(value as Record<string, unknown>, path));
		}
	}
	return result;
}

/** A user is a super admin if they hold api.super (or admin-classic's admin.super). */
export function isSuperAdmin(user: UserInfo): boolean {
	const flat = flattenAccess(user.access);
	return flat.includes('api.super') || flat.includes('admin.super');
}

/**
 * Whether the user has any backend/admin access — i.e. can reach admin-classic
 * (`admin.*`) or the API / Admin Next (`api.*`). Super admins also qualify, so
 * pair this with isSuperAdmin() when you want to show a *distinct* badge for
 * non-super backend users.
 */
export function hasBackendAccess(user: UserInfo): boolean {
	return flattenAccess(user.access).some((p) => p.startsWith('admin.') || p.startsWith('api.'));
}

/**
 * Flatten the registered-permission tree (GET /blueprints/users/permissions)
 * into a de-duplicated, type-ahead-friendly option list. Every node — parent
 * and leaf — is selectable, since filtering by a parent key (e.g. `api`)
 * usefully matches anyone granted anything beneath it. The dotted permission
 * name is kept as the hint so ambiguous labels ("Read", "Write") stay legible.
 */
export function permissionFilterOptions(tree: PermissionAction[]): AccessFilterOption[] {
	const out: AccessFilterOption[] = [];
	const seen = new Set<string>();

	const walk = (nodes: PermissionAction[]) => {
		for (const node of nodes) {
			if (!seen.has(node.name)) {
				seen.add(node.name);
				out.push({ value: node.name, label: node.label || node.name, hint: node.name });
			}
			if (node.children?.length) walk(node.children);
		}
	};
	walk(tree);

	return out.sort((a, b) => a.value.localeCompare(b.value));
}
