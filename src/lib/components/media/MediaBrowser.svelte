<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import {
		getSiteMedia,
		encodeMediaFileUrl,
		mediaAltText,
		siteMediaStreamPath,
		type MediaItem,
		type FolderInfo,
	} from '$lib/api/endpoints/media';
	import { matchesAccept, siteMediaTypeFilter } from '$lib/utils/media-accept';
	import type { MediaPickResult } from '$lib/stores/mediaPicker.svelte';
	import { Folder, ImageOff, Loader2, ChevronRight } from 'lucide-svelte';

	interface Props {
		/** Called with the chosen file as a `media://` url + display url + alt. */
		onpick: (result: MediaPickResult) => void;
		/**
		 * Blueprint-style accept patterns (`image/*`, `.pdf`, `video/mp4`).
		 * Defaults to images only, which is what the editor's insert-image
		 * modal wants; the `media` field passes its own list through.
		 */
		accept?: string[];
		/**
		 * Folder to root browsing at, relative to the media root (`heroes`,
		 * `logos/brand`). Empty browses the whole library. The breadcrumb never
		 * walks above this.
		 */
		root?: string;
	}

	let { onpick, accept = ['image/*'], root = '' }: Props = $props();

	// Own navigation state — deliberately NOT the shared mediaManager store, so
	// browsing here never disturbs the /media page's current folder.
	let currentPath = $state('');
	let folders = $state<FolderInfo[]>([]);
	let items = $state<MediaItem[]>([]);
	let loading = $state(true);
	let error = $state('');

	// Seed from `root` at mount and re-root if the field's `folder` changes under
	// us. Declared before the fetch effect so the first load already targets the
	// configured folder rather than the library root.
	$effect(() => {
		const next = root;
		if (!currentPath.startsWith(next)) currentPath = next;
	});

	// Refetch whenever the path changes.
	$effect(() => {
		void load(currentPath);
	});

	async function load(path: string) {
		loading = true;
		error = '';
		try {
			const res = await getSiteMedia({
				path,
				type: siteMediaTypeFilter(accept),
				per_page: 200,
			});
			// Guard against an out-of-order response after a fast folder change.
			if (path !== currentPath) return;
			folders = res.folders;
			// The endpoint's `type` filter is bucket-level; apply the field's real
			// accept list here so `.pdf` or `image/png` narrow as written.
			items = res.items.filter((item) => matchesAccept(item, accept));
		} catch (e) {
			if (path !== currentPath) return;
			folders = [];
			items = [];
			error = e instanceof Error ? e.message : 'Failed to load media';
		} finally {
			if (path === currentPath) loading = false;
		}
	}

	// Breadcrumb segments: [{ label, path }], the configured root first.
	const crumbs = $derived.by(() => {
		const rootLabel = root
			? (root.split('/').pop() ?? root)
			: i18n.t('ADMIN_NEXT.MEDIA.MEDIA_MANAGER.ROOT');
		const out = [{ label: rootLabel, path: root }];

		const rest = root ? currentPath.slice(root.length).replace(/^\//, '') : currentPath;
		if (rest) {
			let acc = root;
			for (const seg of rest.split('/')) {
				acc = acc ? `${acc}/${seg}` : seg;
				out.push({ label: seg, path: acc });
			}
		}
		return out;
	});

	function resolveThumb(item: MediaItem): string {
		const raw = encodeMediaFileUrl(item.thumbnail_url ?? item.url);
		if (raw.startsWith('http')) return raw;
		return raw.startsWith('/') ? `${auth.serverUrl}${raw}` : `${auth.serverUrl}/${raw}`;
	}

	function resolveDisplay(item: MediaItem): string {
		const raw = item.url;
		if (raw.startsWith('http')) return raw;
		return raw.startsWith('/') ? `${auth.serverUrl}${raw}` : `${auth.serverUrl}/${raw}`;
	}

	function isImage(item: MediaItem): boolean {
		return item.type.startsWith('image/');
	}

	function extLabel(item: MediaItem): string {
		return item.filename.split('.').pop()?.toUpperCase().slice(0, 4) ?? '';
	}

	function openFolder(folder: FolderInfo) {
		currentPath = folder.path;
	}

	function goTo(path: string) {
		if (path !== currentPath) currentPath = path;
	}

	function pick(item: MediaItem) {
		onpick({
			url: siteMediaStreamPath(item),
			display: resolveDisplay(item),
			alt: mediaAltText(item),
		});
	}
</script>

<div class="flex flex-col gap-3">
	<!-- Breadcrumb -->
	<nav class="flex flex-wrap items-center gap-0.5 text-xs text-muted-foreground">
		{#each crumbs as crumb, i (crumb.path)}
			{#if i > 0}
				<ChevronRight size={12} class="opacity-50" />
			{/if}
			<button
				type="button"
				class="rounded px-1 py-0.5 transition-colors hover:bg-accent hover:text-foreground {i === crumbs.length - 1 ? 'font-medium text-foreground' : ''}"
				onclick={() => goTo(crumb.path)}
			>
				{crumb.label}
			</button>
		{/each}
	</nav>

	<div class="min-h-[180px]">
		{#if loading}
			<div class="flex h-[180px] items-center justify-center text-muted-foreground">
				<Loader2 size={20} class="animate-spin" />
			</div>
		{:else if error}
			<div class="flex h-[180px] items-center justify-center px-4 text-center text-xs text-destructive">
				{error}
			</div>
		{:else if folders.length === 0 && items.length === 0}
			<div class="flex h-[180px] flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
				<ImageOff size={18} />
				{i18n.t('ADMIN_NEXT.MARKDOWN_EDITOR.IMAGE_INSERT.NO_MEDIA')}
			</div>
		{:else}
			<div class="grid grid-cols-3 gap-2 sm:grid-cols-4">
				<!-- Folders first -->
				{#each folders as folder (folder.path)}
					<button
						type="button"
						class="flex flex-col items-center justify-center gap-1 rounded-md border border-border bg-muted/30 p-3 text-center transition-colors hover:border-primary hover:bg-accent/40"
						onclick={() => openFolder(folder)}
						title={folder.name}
					>
						<Folder size={26} class="text-muted-foreground" />
						<span class="w-full truncate text-[0.6875rem] text-foreground">{folder.name}</span>
					</button>
				{/each}
				<!-- Then files -->
				{#each items as item (item.filename)}
					<button
						type="button"
						class="group flex flex-col overflow-hidden rounded-md border border-border bg-muted/40 text-start transition-colors hover:border-primary hover:bg-accent/40"
						onclick={() => pick(item)}
						title={item.alt || item.filename}
					>
						<span class="block aspect-square overflow-hidden bg-muted/50">
							{#if isImage(item)}
								<img
									src={resolveThumb(item)}
									alt={item.alt || item.filename}
									class="h-full w-full object-cover transition-transform group-hover:scale-105"
									loading="lazy"
								/>
							{:else}
								<span class="flex h-full w-full items-center justify-center text-xs font-semibold text-muted-foreground">
									{extLabel(item)}
								</span>
							{/if}
						</span>
						<span class="truncate px-1.5 py-1 text-[0.625rem] text-muted-foreground">{item.filename}</span>
					</button>
				{/each}
			</div>
		{/if}
	</div>
</div>
