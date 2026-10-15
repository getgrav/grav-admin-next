import { i18n } from '$lib/stores/i18n.svelte';
import { configEnv } from '$lib/stores/configEnvironment.svelte';
import { dialogs } from '$lib/stores/dialogs.svelte';
import { hasUnsavedChanges } from '$lib/utils/unsaved-guard.svelte';

/**
 * Switch the admin's active environment, the way the environment picker does.
 *
 * Switching re-runs the whole admin via a full reload, which would discard any
 * in-progress edit, so this confirms first when something is dirty (the
 * SvelteKit nav guard can't cover a reload). Resolves false when the user
 * cancels or the environment is already active.
 */
export async function switchEnvironment(name: string): Promise<boolean> {
	if (name === configEnv.target) return false;
	if (hasUnsavedChanges()) {
		const ok = await dialogs.confirm({
			title: i18n.t('ADMIN_NEXT.UNSAVED_CHANGES'),
			message: i18n.t('ADMIN_NEXT.ENVIRONMENT_SWITCHER.SWITCH_DISCARDS_UNSAVED'),
			confirmLabel: i18n.t('ADMIN_NEXT.ENVIRONMENT_SWITCHER.SWITCH_AND_RELOAD'),
			cancelLabel: i18n.t('ADMIN_NEXT.CANCEL'),
			variant: 'destructive',
		});
		if (!ok) return false;
	}
	configEnv.setTarget(name); // persists the choice and reloads the admin
	return true;
}
