<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { portal } from '$lib/utils/portal';
	import { auth } from '$lib/stores/auth.svelte';
	import { X, ImageOff } from 'lucide-svelte';
	import { encodeMediaFileUrl, mediaMarkdown, type MediaItem } from '$lib/api/endpoints/media';

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

	const images = $derived(items.filter((i) => i.type.startsWith('image/')));

	// Manual entry buffer. `url` doubles as the enable-gate for the Insert button.
	let url = $state('');
	let alt = $state('');

	// Seed the manual alt from the editor selection each time the modal opens.
	$effect(() => {
		if (open) {
			url = '';
			alt = altSeed;
		}
	});

	function thumb(item: MediaItem): string {
		const raw = encodeMediaFileUrl(item.thumbnail_url ?? item.url);
		if (raw.startsWith('http')) return raw;
		return raw.startsWith('/') ? `${auth.serverUrl}${raw}` : `${auth.serverUrl}/${raw}`;
	}

	function pickMedia(item: MediaItem) {
		oninsert(mediaMarkdown(item));
	}

	function insertUrl() {
		const src = url.trim();
		if (!src) return;
		oninsert(`![${alt.trim()}](${src})`);
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

			<div class="space-y-5 overflow-y-auto p-4">
				<!-- Page media -->
				<div>
					<h4 class="mb-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
						{i18n.t('ADMIN_NEXT.MARKDOWN_EDITOR.IMAGE_INSERT.PAGE_MEDIA')}
					</h4>
					{#if images.length > 0}
						<div class="grid grid-cols-3 gap-2 sm:grid-cols-4">
							{#each images as item (item.filename)}
								<button
									type="button"
									class="group flex flex-col overflow-hidden rounded-md border border-border bg-muted/40 text-start transition-colors hover:border-primary hover:bg-accent/40"
									onclick={() => pickMedia(item)}
									title={item.alt || item.filename}
								>
									<span class="block aspect-square overflow-hidden bg-muted/50">
										<img
											src={thumb(item)}
											alt={item.alt || item.filename}
											class="h-full w-full object-cover transition-transform group-hover:scale-105"
											loading="lazy"
										/>
									</span>
									<span class="truncate px-1.5 py-1 text-[0.625rem] text-muted-foreground">
										{item.filename}
									</span>
								</button>
							{/each}
						</div>
					{:else}
						<div class="flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
							<ImageOff size={14} />
							{i18n.t('ADMIN_NEXT.MARKDOWN_EDITOR.IMAGE_INSERT.NO_MEDIA')}
						</div>
					{/if}
				</div>

				<!-- Manual URL -->
				<div class="space-y-2 border-t border-border pt-4">
					<h4 class="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
						{i18n.t('ADMIN_NEXT.MARKDOWN_EDITOR.IMAGE_INSERT.FROM_URL')}
					</h4>
					<div>
						<label for="img-insert-url" class="mb-1 block text-xs text-muted-foreground">
							{i18n.t('ADMIN_NEXT.MARKDOWN_EDITOR.IMAGE_INSERT.URL_LABEL')}
						</label>
						<input
							id="img-insert-url"
							type="text"
							bind:value={url}
							onkeydown={(e) => e.key === 'Enter' && insertUrl()}
							placeholder={i18n.t('ADMIN_NEXT.MARKDOWN_EDITOR.IMAGE_INSERT.URL_PLACEHOLDER')}
							class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
						/>
					</div>
					<div>
						<label for="img-insert-alt" class="mb-1 block text-xs text-muted-foreground">
							{i18n.t('ADMIN_NEXT.MARKDOWN_EDITOR.IMAGE_INSERT.ALT_LABEL')}
						</label>
						<input
							id="img-insert-alt"
							type="text"
							bind:value={alt}
							onkeydown={(e) => e.key === 'Enter' && insertUrl()}
							placeholder={i18n.t('ADMIN_NEXT.MARKDOWN_EDITOR.IMAGE_INSERT.ALT_PLACEHOLDER')}
							class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
						/>
					</div>
					<div class="flex justify-end pt-1">
						<button
							type="button"
							disabled={!url.trim()}
							onclick={insertUrl}
							class="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
						>
							{i18n.t('ADMIN_NEXT.MARKDOWN_EDITOR.IMAGE_INSERT.INSERT')}
						</button>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}
