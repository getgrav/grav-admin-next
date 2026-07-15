<!--
	The "you have unsaved changes, leave anyway?" prompt.

	Pair with `createUnsavedGuard()` — the guard decides *when* to prompt, this
	owns *what it says*:

	    const guard = createUnsavedGuard(() => hasChanges);
	    ...
	    <UnsavedChangesModal {guard} />

	This exists because seven routes each inlined the same nine-line ConfirmModal
	with the message and both button labels as English literals. One shared copy
	means the wording is translated once and can't drift again.
-->
<script lang="ts">
	import ConfirmModal from './ConfirmModal.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import type { UnsavedGuard } from '$lib/utils/unsaved-guard.svelte';

	interface Props {
		guard: UnsavedGuard;
	}

	let { guard }: Props = $props();
</script>

<ConfirmModal
	open={guard.showModal}
	title={i18n.t('ADMIN_NEXT.UNSAVED_CHANGES')}
	message={i18n.t('ADMIN_NEXT.UNSAVED_CHANGES_DIALOG.LEAVE_MESSAGE')}
	confirmLabel={i18n.t('ADMIN_NEXT.UNSAVED_CHANGES_DIALOG.LEAVE')}
	cancelLabel={i18n.t('ADMIN_NEXT.UNSAVED_CHANGES_DIALOG.STAY')}
	onconfirm={guard.confirm}
	oncancel={guard.cancel}
/>
