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
	import type { MediaPickResult } from '$lib/stores/mediaPicker.svelte';
	import { Folder, ImageOff, Loader2, ChevronRight } from 'lucide-svelte';

	interface Props {
		/** Called with the chosen image as a `media://` url + display url + alt. */
		onpick: (result: MediaPickResult) => void;
	}

	let { onpick }: Props = $props();

	// Own navigation state — deliberately NOT the shared mediaManager store, so
	// browsing here never disturbs the /media page's current folder.
	let currentPath = $state('');
	let folders = $state<FolderInfo[]>([]);
	let images = $state<MediaItem[]>([]);
	let loading = $state(true);
	let error = $state('');

	// Refetch whenever the path changes.
	$effect(() => {
		void load(currentPath);
	});

	async function load(path: string) {
		loading = true;
		error = '';
		try {
			const res = await getSiteMedia({ path, type: 'image', per_page: 200 });
			// Guard against an out-of-order response after a fast folder change.
			if (path !== currentPath) return;
			folders = res.folders;
			images = res.items;
		} catch (e) {
			if (path !== currentPath) return;
			folders = [];
			images = [];
			error = e instanceof Error ? e.message : 'Failed to load media';
		} finally {
			if (path === currentPath) loading = false;
		}
	}

	// Breadcrumb segments: [{ label, path }], root first.
	const crumbs = $derived.by(() => {
		const out = [{ label: i18n.t('ADMIN_NEXT.MEDIA.MEDIA_MANAGER.ROOT'), path: '' }];
		if (currentPath) {
			let acc = '';
			for (const seg of currentPath.split('/')) {
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
		{:else if folders.length === 0 && images.length === 0}
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
				<!-- Then images -->
				{#each images as item (item.filename)}
					<button
						type="button"
						class="group flex flex-col overflow-hidden rounded-md border border-border bg-muted/40 text-start transition-colors hover:border-primary hover:bg-accent/40"
						onclick={() => pick(item)}
						title={item.alt || item.filename}
					>
						<span class="block aspect-square overflow-hidden bg-muted/50">
							<img
								src={resolveThumb(item)}
								alt={item.alt || item.filename}
								class="h-full w-full object-cover transition-transform group-hover:scale-105"
								loading="lazy"
							/>
						</span>
						<span class="truncate px-1.5 py-1 text-[0.625rem] text-muted-foreground">{item.filename}</span>
					</button>
				{/each}
			</div>
		{/if}
	</div>
</div>
