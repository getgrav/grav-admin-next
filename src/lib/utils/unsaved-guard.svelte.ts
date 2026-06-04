import { beforeNavigate, goto } from '$app/navigation';
import { onDestroy } from 'svelte';
import { i18n } from '$lib/stores/i18n.svelte';

/**
 * Active dirty-checkers across all mounted guards. Lets non-navigation flows
 * (e.g. the environment switcher's full reload, which SvelteKit's
 * beforeNavigate can't intercept) ask whether anything has unsaved changes.
 */
const dirtyCheckers = new Set<() => boolean>();

/** True if any mounted editor currently reports unsaved changes. */
export function hasUnsavedChanges(): boolean {
	for (const isDirty of dirtyCheckers) {
		if (isDirty()) return true;
	}
	return false;
}

/**
 * Creates a navigation guard that shows a custom confirm modal
 * instead of the browser's native confirm() dialog.
 *
 * Usage:
 *   const guard = createUnsavedGuard(() => hasChanges);
 *
 *   <ConfirmModal
 *     open={guard.showModal}
 *     title={i18n.t('ADMIN_NEXT.UNSAVED_CHANGES')}
 *     message="You have unsaved changes. Leave anyway?"
 *     confirmLabel="Leave"
 *     cancelLabel="Stay"
 *     onconfirm={guard.confirm}
 *     oncancel={guard.cancel}
 *   />
 */
export function createUnsavedGuard(isDirty: () => boolean) {
	let showModal = $state(false);
	let pendingUrl = $state<string | null>(null);
	let bypassing = false;

	// Participate in the global dirty registry so non-navigation flows (full
	// reloads) can detect unsaved changes too. Unregister on teardown.
	dirtyCheckers.add(isDirty);
	onDestroy(() => dirtyCheckers.delete(isDirty));

	beforeNavigate(({ cancel, to }) => {
		if (isDirty() && !bypassing) {
			cancel();
			pendingUrl = to?.url
				? to.url.pathname + to.url.search + to.url.hash
				: null;
			showModal = true;
		}
		bypassing = false;
	});

	return {
		get showModal() {
			return showModal;
		},
		/** Allow the next navigation to proceed without checking isDirty. */
		bypass() {
			bypassing = true;
		},
		confirm() {
			showModal = false;
			if (pendingUrl) {
				bypassing = true;
				goto(pendingUrl);
				pendingUrl = null;
			}
		},
		cancel() {
			showModal = false;
			pendingUrl = null;
		},
	};
}
