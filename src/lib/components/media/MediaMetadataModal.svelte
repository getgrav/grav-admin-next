<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { portal } from '$lib/utils/portal';
	import { X } from 'lucide-svelte';
	import MediaMetadataForm from './MediaMetadataForm.svelte';
	import type { MediaMetaResponse, MediaMetaValues } from '$lib/api/endpoints/media';

	interface Props {
		open: boolean;
		filename: string;
		load: () => Promise<MediaMetaResponse>;
		save: (values: MediaMetaValues) => Promise<MediaMetaResponse>;
		readonly?: boolean;
		onclose: () => void;
		onsaved?: (meta: MediaMetaResponse) => void;
	}

	let { open, filename, load, save, readonly = false, onclose, onsaved }: Props = $props();

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
		<div class="flex max-h-[85vh] w-full max-w-md flex-col rounded-xl border border-border bg-card shadow-2xl">
			<div class="flex items-center justify-between border-b border-border px-4 py-3">
				<div class="min-w-0">
					<h3 class="text-sm font-semibold text-foreground">
						{i18n.t('ADMIN_NEXT.MEDIA.METADATA.TITLE')}
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
				<MediaMetadataForm {filename} {load} {save} {readonly} {onsaved} />
			</div>
		</div>
	</div>
{/if}
