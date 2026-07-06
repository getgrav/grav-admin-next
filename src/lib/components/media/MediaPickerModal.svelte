<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { portal } from '$lib/utils/portal';
	import { mediaPicker, type MediaPickResult } from '$lib/stores/mediaPicker.svelte';
	import MediaBrowser from './MediaBrowser.svelte';
	import { X } from 'lucide-svelte';

	function handlePick(result: MediaPickResult) {
		mediaPicker.pick(result);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') mediaPicker.cancel();
	}
</script>

<svelte:window onkeydown={mediaPicker.open_ ? handleKeydown : undefined} />

{#if mediaPicker.open_}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		use:portal
		class="fixed inset-0 z-[60] flex items-center justify-center bg-neutral-900/75 p-4 backdrop-blur-sm"
		onclick={(e) => { if (e.target === e.currentTarget) mediaPicker.cancel(); }}
	>
		<div class="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-card shadow-2xl">
			<div class="flex items-center justify-between border-b border-border px-4 py-3">
				<h3 class="text-sm font-semibold text-foreground">
					{i18n.t('ADMIN_NEXT.MARKDOWN_EDITOR.IMAGE_INSERT.SITE_MEDIA')}
				</h3>
				<button
					class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					onclick={() => mediaPicker.cancel()}
					aria-label={i18n.t('ADMIN_NEXT.CANCEL')}
				>
					<X size={14} />
				</button>
			</div>
			<div class="overflow-y-auto p-4">
				<MediaBrowser onpick={handlePick} />
			</div>
		</div>
	</div>
{/if}
