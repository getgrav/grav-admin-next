<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { portal } from '$lib/utils/portal';
	import { X } from 'lucide-svelte';
	import MediaMetadataForm from './MediaMetadataForm.svelte';
	import MediaFileDetails from './MediaFileDetails.svelte';
	import type { MediaItem, MediaMetaResponse, MediaMetaValues } from '$lib/api/endpoints/media';

	interface Props {
		open: boolean;
		filename: string;
		/**
		 * The item being edited. When given, the modal shows the same file facts
		 * (preview, type, size, dimensions, modified, copyable path/URL) as the
		 * Media manager's inspector above the metadata form.
		 */
		file?: MediaItem;
		/** Path row for the facts list — the page route, for page media. */
		path?: string;
		/** Copyable one-line values (reference, URL, markdown snippet, …). */
		copyRows?: { label: string; value: string }[];
		/** When set, an "Open" link to the file is rendered under the copy rows. */
		openUrl?: string;
		load: () => Promise<MediaMetaResponse>;
		save: (values: MediaMetaValues) => Promise<MediaMetaResponse>;
		readonly?: boolean;
		onclose: () => void;
		onsaved?: (meta: MediaMetaResponse) => void;
	}

	let {
		open,
		filename,
		file,
		path,
		copyRows,
		openUrl,
		load,
		save,
		readonly = false,
		onclose,
		onsaved,
	}: Props = $props();

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
		<div
			class="flex max-h-[85vh] w-full flex-col rounded-xl border border-border bg-card shadow-2xl {file
				? 'max-w-3xl'
				: 'max-w-md'}"
		>
			<div class="flex items-center justify-between border-b border-border px-4 py-3">
				<div class="min-w-0">
					<h3 class="text-sm font-semibold text-foreground">
						{file
							? i18n.t('ADMIN_NEXT.MEDIA.FILE_DETAILS.TITLE')
							: i18n.t('ADMIN_NEXT.MEDIA.METADATA.TITLE')}
					</h3>
					<p class="mt-0.5 truncate text-xs text-muted-foreground">{filename}</p>
				</div>
				<button
					class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					onclick={onclose}
					aria-label={i18n.t('ADMIN_NEXT.CANCEL')}
				>
					<X size={14} />
				</button>
			</div>
			<div class="overflow-y-auto p-4">
				{#if file}
					<!-- Side by side where there is room: the facts are a narrow column, so
					     stacking them above the form made for a very tall dialog. Below the
					     breakpoint the two simply stack, separated by a rule. -->
					<div class="grid gap-5 sm:grid-cols-[17rem_minmax(0,1fr)]">
						<div>
							<MediaFileDetails {file} {path} {copyRows} {openUrl} />
						</div>
						<div class="border-t border-border pt-4 sm:border-s sm:border-t-0 sm:ps-5 sm:pt-0">
							<h4 class="mb-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
								{i18n.t('ADMIN_NEXT.MEDIA.METADATA.TITLE')}
							</h4>
							<MediaMetadataForm {filename} {load} {save} {readonly} {onsaved} />
						</div>
					</div>
				{:else}
					<MediaMetadataForm {filename} {load} {save} {readonly} {onsaved} />
				{/if}
			</div>
		</div>
	</div>
{/if}
