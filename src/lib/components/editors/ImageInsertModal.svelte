<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { portal } from '$lib/utils/portal';
	import { X } from 'lucide-svelte';
	import { mdDestination, mediaMarkdown, type MediaItem } from '$lib/api/endpoints/media';
	import MediaSourceTabs from '$lib/components/media/MediaSourceTabs.svelte';
	import type { MediaSelection } from '$lib/components/media/types';

	interface Props {
		open: boolean;
		/** Live page media list (already carries alt/title from the API). */
		items?: MediaItem[];
		/** Selected editor text, used to prefill the manual alt field. */
		altSeed?: string;
		/** Receives the markdown to drop at the editor's cursor. */
		oninsert: (markdown: string) => void;
		onclose: () => void;
	}

	let { open, items = [], altSeed = '', oninsert, onclose }: Props = $props();

	function handleSelect(sel: MediaSelection) {
		// Page media keeps the media-aware markdown builder (it emits a plain
		// link for non-images); site/url picks are always images here.
		oninsert(
			sel.source === 'page' && sel.item
				? mediaMarkdown(sel.item)
				: `![${sel.alt}](${mdDestination(sel.value)})`,
		);
	}

	function handleBackdrop(e: MouseEvent) {
		if (e.target === e.currentTarget) onclose();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}
</script>

<svelte:window onkeydown={open ? handleKeydown : undefined} />

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		use:portal
		class="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/75 p-4 backdrop-blur-sm"
		onclick={handleBackdrop}
	>
		<div class="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-border bg-card shadow-2xl">
			<div class="flex items-center justify-between border-b border-border px-4 py-3">
				<h3 class="text-sm font-semibold text-foreground">
					{i18n.t('ADMIN_NEXT.MARKDOWN_EDITOR.IMAGE_INSERT.TITLE')}
				</h3>
				<button
					class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					onclick={onclose}
					aria-label={i18n.t('ADMIN_NEXT.CANCEL')}
				>
					<X size={14} />
				</button>
			</div>

			<MediaSourceTabs
				sources={['page', 'site', 'url']}
				{items}
				accept={['image/*']}
				showAlt
				{altSeed}
				active={open}
				onselect={handleSelect}
			/>
		</div>
	</div>
{/if}
