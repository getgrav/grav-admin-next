<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	/**
	 * Slim inline notice rendered above the read-only content viewer when
	 * a peer using a different editor type joined the room first.
	 *
	 * Mixed editor types (CodeMirror's Y.Text vs editor-pro's Y.XmlFragment)
	 * can't share state at the CRDT level, so the late joiner can't write
	 * — but we still mount a CodeMirror viewer bound to Y.Text below this
	 * banner so they can watch peer edits flow in live (Y.Text always
	 * receives the current content, either directly from a CM owner's
	 * yCollab or via editor-pro's onUpdate→markdown→textarea round-trip).
	 */

	import { auth } from '$lib/stores/auth.svelte';
	import { base } from '$app/paths';
	import { Lock } from 'lucide-svelte';

	interface Props {
		ownerType: string;
		ownerName: string;
	}

	let { ownerType, ownerName }: Props = $props();

	const ownerLabel = $derived(
		ownerType === 'codemirror'
			? i18n.t('ADMIN_NEXT.SYNC.EDITOR_LOCK_NOTICE.BUILTIN_MARKDOWN_EDITOR')
			: ownerType,
	);
</script>

<div class="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs dark:border-amber-700/60 dark:bg-amber-950/30">
	<Lock size={13} class="shrink-0 text-amber-700 dark:text-amber-300" />
	<p class="text-amber-900 dark:text-amber-200">
		{@html i18n.tHtml('ADMIN_NEXT.SYNC.EDITOR_LOCK_NOTICE.LOCKED', {
			owner: ownerName,
			editor: ownerLabel,
			href: `${base}/users/${auth.username}`,
		})}
	</p>
</div>
