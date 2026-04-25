<script lang="ts">
	/**
	 * Banner shown in place of the content editor when the user has joined
	 * a collab session whose first peer is using a different editor type.
	 *
	 * Mixed editor types can't share state at the CRDT level — Y.Text (used
	 * by CodeMirror's yCollab) and Y.XmlFragment (used by editor-pro's
	 * y-prosemirror) live in the same Y.Doc but don't cross-sync, so
	 * allowing both at once silently split-brains the content. The page
	 * editor locks to whoever joined the room first; later joiners with
	 * a different editor see this notice instead of an editor that would
	 * lie to them about being collaborative.
	 */

	import { auth } from '$lib/stores/auth.svelte';
	import { base } from '$app/paths';
	import { Lock, ExternalLink } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';

	interface Props {
		ownerType: string;
		ownerName: string;
	}

	let { ownerType, ownerName }: Props = $props();

	const ownerLabel = $derived(
		ownerType === 'codemirror' ? 'the built-in markdown editor' : ownerType,
	);
</script>

<div class="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700/60 dark:bg-amber-950/30">
	<div class="flex items-start gap-3">
		<div class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300">
			<Lock size={14} />
		</div>
		<div class="min-w-0 flex-1">
			<p class="text-sm font-semibold text-amber-900 dark:text-amber-200">
				This page is being edited with {ownerLabel}
			</p>
			<p class="mt-1 text-[13px] text-amber-800/90 dark:text-amber-200/80">
				{ownerName} got here first. Real-time collaboration only works when every peer uses the same editor — different types store content in separate CRDT shapes and would silently diverge if mixed. Switch your content editor preference to match, or come back when {ownerName} is done.
			</p>
			<div class="mt-3 flex flex-wrap items-center gap-2">
				<Button
					size="sm"
					variant="outline"
					class="bg-white dark:bg-background"
					href="{base}/users/{auth.username}"
				>
					<ExternalLink size={13} />
					Open my profile
				</Button>
			</div>
		</div>
	</div>
</div>
