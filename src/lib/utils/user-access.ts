import type { UserInfo } from '$lib/api/endpoints/users';
import type { PermissionAction } from '$lib/api/endpoints/blueprints';
import type { GroupInfo } from '$lib/api/endpoints/groups';

export interface AccessFilterOption {
	value: string;
	label: string;
	hint?: string;
}

/**
 * A single permission a user effectively receives from group membership,
 * resolved the same way Grav's `UserObject::authorize()` does (any group deny
 * wins, else any group allow). Purely informational: the permissions UI renders
 * these as a read-only overlay and never persists them onto the user's own
 * `access` map. See getgrav/grav#4144.
 */
export interface InheritedPermission {
	state: 'allowed' | 'denied';
	/** Readable names of the group(s) that contribute this permission. */
	groups: string[];
}

/** Flat map of permission name (e.g. `api.pages.read`) → inherited result. */
export type InheritedAccessMap = Record<string, InheritedPermission>;

/**
 * Coerce a loaded `access` value into a plain object.
 *
 * The API serialises an empty access map as a JSON array (`[]`) rather than an
 * object (`{}`), because PHP can't tell an empty map from an empty list. Left as
 * an array it breaks the permissions editor: the toggle adds object keys but
 * pruneEmpty treats the value as an array and strips them, so the first
 * permission can never be added and the form never goes dirty (admin2#58).
 * Anything that isn't a plain object becomes `{}`.
 */
export function toAccessRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

/**
 * Flatten a nested access object into dot-notation keys, keeping BOTH explicit
 * grants and denials. `{ api: { pages: { read: true, delete: false } } }` →
 * `{ 'api.pages.read': true, 'api.pages.delete': false }`. (flattenAccess above
 * keeps only the `true` keys; group resolution needs the `false` ones too.)
 */
export function flattenAccessBooleans(
	access: Record<string, unknown> | null | undefined,
	prefix = '',
): Record<string, boolean> {
	const out: Record<string, boolean> = {};
	if (!access || typeof access !== 'object') return out;
	for (const [key, value] of Object.entries(access)) {
		const path = prefix ? `${prefix}.${key}` : key;
		if (value === true || value === false) {
			out[path] = value;
		} else if (value && typeof value === 'object') {
			Object.assign(out, flattenAccessBooleans(value as Record<string, unknown>, path));
		}
	}
	return out;
}

/**
 * Resolve the permissions a user inherits from their group membership into the
 * read-only overlay the permissions UI renders. Mirrors Grav's
 * `UserGroupCollection::authorize()`: across the user's groups, an explicit
 * deny wins; otherwise an explicit allow wins. The contributing group names are
 * kept for the tooltip/badge. Group permissions the user also sets directly are
 * still returned here — the row decides whether the direct value overrides.
 */
export function resolveInheritedAccess(
	groupKeys: string[],
	groups: GroupInfo[],
): InheritedAccessMap {
	const byKey = new Map<string, GroupInfo>();
	for (const g of groups) byKey.set(g.groupname, g);

	const acc: Record<string, { allows: string[]; denies: string[] }> = {};
	for (const key of groupKeys) {
		const group = byKey.get(key);
		if (!group || group.enabled === false) continue;
		const label = group.readableName || group.groupname;
		for (const [perm, granted] of Object.entries(flattenAccessBooleans(group.access))) {
			const entry = (acc[perm] ??= { allows: [], denies: [] });
			(granted ? entry.allows : entry.denies).push(label);
		}
	}

	const result: InheritedAccessMap = {};
	for (const [perm, { allows, denies }] of Object.entries(acc)) {
		if (denies.length > 0) {
			result[perm] = { state: 'denied', groups: denies };
		} else if (allows.length > 0) {
			result[perm] = { state: 'allowed', groups: allows };
		}
	}
	return result;
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
