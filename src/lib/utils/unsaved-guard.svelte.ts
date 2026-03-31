import { beforeNavigate, goto } from '$app/navigation';

/**
 * Creates a navigation guard that shows a custom confirm modal
 * instead of the browser's native confirm() dialog.
 *
 * Usage:
 *   const guard = createUnsavedGuard(() => hasChanges);
 *
 *   <ConfirmModal
 *     open={guard.showModal}
 *     title="Unsaved Changes"
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
