import { beforeNavigate, goto } from '$app/navigation';
import { i18n } from '$lib/stores/i18n.svelte';

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
