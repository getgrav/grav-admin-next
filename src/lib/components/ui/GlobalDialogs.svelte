<script lang="ts">
	import ConfirmModal from './ConfirmModal.svelte';
	import { dialogs } from '$lib/stores/dialogs.svelte';
</script>

<ConfirmModal
	open={!!dialogs.current}
	title={dialogs.current?.title}
	message={dialogs.current?.message ?? ''}
	confirmLabel={dialogs.current?.confirmLabel}
	cancelLabel={dialogs.current?.cancelLabel}
	variant={dialogs.current?.variant}
	onconfirm={() => dialogs.accept()}
	oncancel={() => dialogs.dismiss()}
/>
