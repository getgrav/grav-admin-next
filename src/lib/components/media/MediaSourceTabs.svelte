<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import { encodeMediaFileUrl, mediaAltText, type MediaItem } from '$lib/api/endpoints/media';
	import { matchesAccept } from '$lib/utils/media-accept';
	import type { MediaPickResult } from '$lib/stores/mediaPicker.svelte';
	import type { MediaSelection, MediaSourceKind } from './types';
	import MediaBrowser from './MediaBrowser.svelte';
	import { ImageOff } from 'lucide-svelte';

	interface Props {
		/** Tabs to offer, in order. A single source renders no tab strip. */
		sources?: MediaSourceKind[];
		/** Page/object media, already fetched by the host. */
		items?: MediaItem[];
		/** Blueprint accept patterns; narrows every source. */
		accept?: string[];
		/** Folder the Site tab is rooted at, relative to the media root. */
		root?: string;
		/** Show the alt-text input on the URL tab (the editor wants it; fields don't). */
		showAlt?: boolean;
		/** Prefills the alt input — the editor seeds it from the selection. */
		altSeed?: string;
		/** Reset the tab + URL buffer whenever this flips to true. */
		active?: boolean;
		onselect: (selection: MediaSelection) => void;
	}

	let {
		sources = ['page', 'site', 'url'],
		items = [],
		accept = ['image/*'],
		root = '',
		showAlt = false,
		altSeed = '',
		active = true,
		onselect,
	}: Props = $props();

	const TAB_LABELS: Record<MediaSourceKind, string> = $derived({
		page: i18n.t('ADMIN_NEXT.MARKDOWN_EDITOR.IMAGE_INSERT.PAGE_MEDIA'),
		site: i18n.t('ADMIN_NEXT.MARKDOWN_EDITOR.IMAGE_INSERT.SITE_MEDIA'),
		url: i18n.t('ADMIN_NEXT.MARKDOWN_EDITOR.IMAGE_INSERT.FROM_URL'),
	});

	const pageItems = $derived(items.filter((i) => matchesAccept(i, accept)));

	// Corrected by the `active` effect below before anything renders; the literal
	// is only a placeholder so the initial value doesn't capture a prop.
	let tab = $state<MediaSourceKind>('page');

	// Manual entry buffer. `url` doubles as the enable-gate for the Insert button.
	let url = $state('');
	let alt = $state('');

	// Reset each time the host activates the picker: default to page media when
	// the page actually has some, else the first source that isn't `page`.
	$effect(() => {
		if (!active) return;
		url = '';
		alt = altSeed;
		tab =
			sources.includes('page') && pageItems.length
				? 'page'
				: (sources.find((s) => s !== 'page') ?? sources[0] ?? 'page');
	});

	function absolute(raw: string): string {
		if (raw.startsWith('http')) return raw;
		return raw.startsWith('/') ? `${auth.serverUrl}${raw}` : `${auth.serverUrl}/${raw}`;
	}

	function thumb(item: MediaItem): string {
		return absolute(encodeMediaFileUrl(item.thumbnail_url ?? item.url));
	}

	function isImage(item: MediaItem): boolean {
		return item.type.startsWith('image/');
	}

	function pickPageItem(item: MediaItem) {
		// Page media is addressed by bare filename — that's what markdown,
		// `page.media[…]`, and the legacy filepicker value all expect.
		onselect({
			value: item.filename,
			display: absolute(encodeMediaFileUrl(item.url)),
			alt: mediaAltText(item),
			source: 'page',
			item,
		});
	}

	function pickSite(result: MediaPickResult) {
		onselect({ value: result.url, display: result.display, alt: result.alt, source: 'site' });
	}

	function submitUrl() {
		const src = url.trim();
		if (!src) return;
		onselect({ value: src, display: absolute(src), alt: alt.trim(), source: 'url' });
	}
</script>

{#if sources.length > 1}
	<div class="flex gap-1 border-b border-border px-4 pt-2">
		{#each sources as key (key)}
			<button
				type="button"
				class="-mb-px border-b-2 px-3 py-2 text-xs font-medium transition-colors {tab === key
					? 'border-primary text-foreground'
					: 'border-transparent text-muted-foreground hover:text-foreground'}"
				onclick={() => (tab = key)}
			>
				{TAB_LABELS[key]}
			</button>
		{/each}
	</div>
{/if}

<div class="overflow-y-auto p-4">
	{#if tab === 'page'}
		{#if pageItems.length > 0}
			<div class="grid grid-cols-3 gap-2 sm:grid-cols-4">
				{#each pageItems as item (item.filename)}
					<button
						type="button"
						class="group flex flex-col overflow-hidden rounded-md border border-border bg-muted/40 text-start transition-colors hover:border-primary hover:bg-accent/40"
						onclick={() => pickPageItem(item)}
						title={item.alt || item.filename}
					>
						<span class="block aspect-square overflow-hidden bg-muted/50">
							{#if isImage(item)}
								<img
									src={thumb(item)}
									alt={item.alt || item.filename}
									class="h-full w-full object-cover transition-transform group-hover:scale-105"
									loading="lazy"
								/>
							{:else}
								<span class="flex h-full w-full items-center justify-center text-xs font-semibold text-muted-foreground">
									{item.filename.split('.').pop()?.toUpperCase().slice(0, 4) ?? ''}
								</span>
							{/if}
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
	{:else if tab === 'site'}
		<MediaBrowser onpick={pickSite} {accept} {root} />
	{:else}
		<div class="space-y-3">
			<div>
				<label for="media-src-url" class="mb-1 block text-xs text-muted-foreground">
					{i18n.t('ADMIN_NEXT.MARKDOWN_EDITOR.IMAGE_INSERT.URL_LABEL')}
				</label>
				<input
					id="media-src-url"
					type="text"
					bind:value={url}
					onkeydown={(e) => e.key === 'Enter' && submitUrl()}
					placeholder={i18n.t('ADMIN_NEXT.MARKDOWN_EDITOR.IMAGE_INSERT.URL_PLACEHOLDER')}
					class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
				/>
			</div>
			{#if showAlt}
				<div>
					<label for="media-src-alt" class="mb-1 block text-xs text-muted-foreground">
						{i18n.t('ADMIN_NEXT.MARKDOWN_EDITOR.IMAGE_INSERT.ALT_LABEL')}
					</label>
					<input
						id="media-src-alt"
						type="text"
						bind:value={alt}
						onkeydown={(e) => e.key === 'Enter' && submitUrl()}
						placeholder={i18n.t('ADMIN_NEXT.MARKDOWN_EDITOR.IMAGE_INSERT.ALT_PLACEHOLDER')}
						class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
					/>
				</div>
			{/if}
			<div class="flex justify-end pt-1">
				<button
					type="button"
					disabled={!url.trim()}
					onclick={submitUrl}
					class="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
				>
					{i18n.t('ADMIN_NEXT.MARKDOWN_EDITOR.IMAGE_INSERT.INSERT')}
				</button>
			</div>
		</div>
	{/if}
</div>
