import { auth } from '$lib/stores/auth.svelte';
import { dialogs } from '$lib/stores/dialogs.svelte';
import { accessGrantsSuper } from '$lib/utils/user-access';
import type { UserInfo, UserRowAction } from '$lib/api/endpoints/users';
import type { GroupInfo } from '$lib/api/endpoints/groups';

/** The account a user action targets, as its confirmation names it: "Bob Example (@bob)", or "@bob". */
export function userRowActionTarget(user: { username: string; fullname?: string | null }): string {
	const name = (user.fullname ?? '').trim();
	return name && name !== user.username ? `${name} (@${user.username})` : `@${user.username}`;
}

/**
 * Whether the signed-in user can run plugin-declared actions on this account.
 * Follows the API's requireNotSuperTarget(): a super admin's account only takes
 * them from a super admin, or from its own owner. The account is super through
 * its own access or through any of its groups, so pass the site's groups to
 * catch the second case; without them such an account still shows its actions
 * and the API refuses the call.
 */
export function canRunUserRowActions(user: UserInfo, groups: readonly GroupInfo[] = []): boolean {
	if (auth.isSuperAdmin || user.username === auth.username) return true;
	if (accessGrantsSuper(user.access)) return false;
	const superGroups = new Set(groups.filter((g) => accessGrantsSuper(g.access)).map((g) => g.groupname));
	return !(user.groups ?? []).some((key) => superGroups.has(key));
}

/**
 * Ask before running a plugin-declared user action (onApiUserListRowActions)
 * that declares a confirmation. The dialog names the account, so the admin can
 * see they picked the right one (the action's own text is the same for every
 * account). Resolves true when the action asks for no confirmation.
 */
export async function confirmUserRowAction(
	action: UserRowAction,
	user: { username: string; fullname?: string | null },
): Promise<boolean> {
	if (!action.confirm) return true;

	return dialogs.confirm({
		title: action.label,
		message: action.confirm,
		items: [userRowActionTarget(user)],
		confirmLabel: action.label,
	});
}
