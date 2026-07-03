<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { onMount } from 'svelte';
	import { Uppy } from '@uppy/core';
	import XHRUpload from '@uppy/xhr-upload';
	import ImageEditor from '@uppy/image-editor';
	import { auth } from '$lib/stores/auth.svelte';
	import { api } from '$lib/api/client';
	import { invalidations } from '$lib/stores/invalidation.svelte';
	import { getPageMedia, deletePageMedia, getObjectMedia, deleteObjectMedia, getPageMediaMeta, savePageMediaMeta, encodeMediaFileUrl, type MediaItem } from '$lib/api/endpoints/media';
	import { toast } from 'svelte-sonner';
	import { uploadErrorMessage } from '$lib/utils/upload-error';
	import { Upload, X, ImagePlus, ArrowUpDown, Info } from 'lucide-svelte';
	import MediaMetadataModal from './MediaMetadataModal.svelte';

	interface Props {
		route?: string;
		/**
		 * Relative API base for a non-page media source (e.g. a flex object:
		 * `flex-objects/contacts/abc123`). When set, all media operations target
		 * `${apiBase}/media` instead of the page-route endpoint. `null` means the
		 * source isn't resolved yet (skip requests).
		 */
		apiBase?: string | null;
		/** Invalidation channels to emit after upload/delete (apiBase mode). */
		invalidationKeys?: string[];
		onMediaChange?: (items: MediaItem[]) => void;
		/** External media items from shared context — when updated externally, syncs into local state */
		externalItems?: MediaItem[];
		/**
		 * Persist a manual media ordering as the page's `header.media_order`.
		 * Receives the ordered filename list. Only wired in page mode (a page
		 * header exists to hold the value); absent in flex/object mode.
		 */
		onOrderChange?: (filenames: string[]) => void;
		/** True when the page already has a `media_order` in effect, so uploads/deletes keep it synced. */
		orderActive?: boolean;
	}

	let { route = '/', apiBase, invalidationKeys, onMediaChange, externalItems, onOrderChange, orderActive = false }: Props = $props();

	// True when this instance addresses a non-page source via apiBase. The
	// `apiBase` prop being present (even if null) signals flex/object mode.
	const objectMode = $derived(apiBase !== undefined);

	// Manual drag-to-reorder is only meaningful in page mode, where the ordered
	// filename list is saved to `header.media_order` and read back by core.
	const reorderEnabled = $derived(!objectMode && !!onOrderChange);

	// Reorder is an explicit mode rather than a hidden grip handle: in 1.7 you
	// just dragged the image to reorder, so here a toggle flips what dragging a
	// tile does — into the editor (default) vs reordering within the grid. They
	// can't share one drag gesture, hence the mode.
	let reordering = $state(false);

	// In-grid reorder drag state (distinct from the drag-OUT-to-editor on the tile body).
	let draggingIndex = $state<number | null>(null);
	let dragOverIndex = $state<number | null>(null);
	let dropPos = $state<'before' | 'after'>('before');

	let mediaItems = $state<MediaItem[]>([]);

	// The toggle only appears when reorder is possible and there's more than one
	// item to sort. Declared after mediaItems so the derived can read it.
	const canReorder = $derived(reorderEnabled && mediaItems.length > 1);
	// Reorder is actually active only while the toggle is on AND still possible
	// (e.g. deleting down to one item silently exits the mode).
	const inReorderMode = $derived(reordering && canReorder);

	// Sync from external context when it changes (e.g. FileField uploaded a file)
	$effect(() => {
		if (externalItems && externalItems.length > 0) {
			mediaItems = externalItems;
		}
	});
	let loading = $state(true);
	let uploading = $state(false);
	let uploadProgress = $state<Map<string, number>>(new Map());
	let dragOver = $state(false);
	let dragCounter = $state(0);

	// Image editor state
	let editingFile = $state<{ id: string; name: string; url: string } | null>(null);

	// Metadata editor state. Editing the `.meta.yaml` sidecar is a page-media
	// concept (keyed by page route + filename), so it's offered in page mode
	// only — not for flex/object media sources, which have no such endpoint.
	let metaItem = $state<MediaItem | null>(null);
	const canEditMeta = $derived(!objectMode && route !== '/' && route !== '');

	// Uppy instance
	let uppy: Uppy | undefined;
	let dropzoneEl: HTMLDivElement;
	let fileInputEl: HTMLInputElement;

	// `route` starts out as `/` when the user lands on `/pages/edit/` without
	// an explicit slug — the host page resolves the home alias and replaces
	// the URL with the structural route (`/home`). Until that resolves we
	// treat the route as "not yet ready": API calls are skipped and Uppy's
	// endpoint is an unreachable placeholder (the user can't drop files
	// during that short window anyway because the dropzone hasn't mounted
	// fully yet).
	// Resolved relative API base (no leading slash, no trailing /media). In
	// object mode it's the supplied apiBase; in page mode it's derived from
	// the route once the route resolves to a concrete structural path.
	const resolvedBase = $derived.by(() => {
		if (objectMode) return apiBase ?? null;
		if (route === '' || route === '/') return null;
		return `pages/${route.startsWith('/') ? route.slice(1) : route}`;
	});
	const routeReady = $derived(resolvedBase !== null);

	function getUploadEndpoint() {
		if (!resolvedBase) return `${auth.serverUrl}${auth.apiPrefix}/pages/__unresolved__/media`;
		return `${auth.serverUrl}${auth.apiPrefix}/${resolvedBase}/media`;
	}

	function getAuthHeaders(): Record<string, string> {
		const h: Record<string, string> = {};
		if (auth.accessToken) h['X-API-Token'] = auth.accessToken;
		h['X-Grav-Environment'] = auth.gravEnvironment;
		return h;
	}

	function initUppy() {
		uppy = new Uppy({
			id: 'page-media',
			autoProceed: true,
			restrictions: {
				maxFileSize: 64 * 1024 * 1024,
			},
		});

		uppy.use(XHRUpload, {
			endpoint: getUploadEndpoint(),
			fieldName: 'file',
			headers: getAuthHeaders,
		});

		uppy.use(ImageEditor, {
			quality: 0.8,
			actions: {
				revert: true,
				rotate: true,
				granularRotate: true,
				flip: true,
				zoomIn: true,
				zoomOut: true,
				cropSquare: true,
				cropWidescreen: true,
				cropWidescreenVertical: true,
			},
		});

		// Pre-check token so Uppy's XHR uploads don't fail silently on expiry.
		uppy.addPreProcessor(async () => {
			await api.ensureAuth();
		});

		uppy.on('upload-start', () => {
			uploading = true;
		});

		uppy.on('upload-progress', (file, progress) => {
			if (file) {
				const total = progress.bytesTotal ?? 0;
				const pct = total > 0
					? Math.round((progress.bytesUploaded / total) * 100)
					: 0;
				uploadProgress = new Map(uploadProgress.set(file.id, pct));
			}
		});

		uppy.on('upload-success', (file) => {
			if (file) {
				uploadProgress.delete(file.id);
				uploadProgress = new Map(uploadProgress);
			}
		});

		uppy.on('upload-error', (file, error, request) => {
			const message = uploadErrorMessage(error, request as XMLHttpRequest | undefined);
			toast.error(`Failed to upload ${file?.name ?? 'file'}: ${message}`);
		});

		uppy.on('complete', async () => {
			uploading = false;
			uploadProgress = new Map();
			// XHRUpload bypasses our API client, so emit invalidation manually.
			invalidations.emit(getInvalidationKeys());
			// Refresh media list after uploads complete
			await loadMedia();
			// Record the newly uploaded file(s) into a saved ordering so they
			// don't drift back to natural sort on the next reload.
			if (orderActive) emitOrder();
			// Clear Uppy's file list so the dropzone is ready for new files
			uppy?.cancelAll();
		});

		uppy.on('file-editor:complete', () => {
			editingFile = null;
		});

		uppy.on('file-editor:cancel', () => {
			editingFile = null;
		});
	}

	function getInvalidationKeys(): string[] {
		if (objectMode) return invalidationKeys ?? [];
		return [`media:update:pages/${route}`, `pages:update:/${route}`];
	}

	async function loadMedia() {
		if (!resolvedBase) {
			// Source not resolved yet — page host is still resolving the home
			// alias, or a flex object hasn't been saved. Defer until the base
			// resolves; the $effect below re-fires loadMedia once it does.
			return;
		}
		try {
			mediaItems = objectMode
				? await getObjectMedia(resolvedBase)
				: await getPageMedia(route);
			onMediaChange?.(mediaItems);
		} catch (err) {
			console.error('[PageMedia] Failed to load media:', err);
		} finally {
			loading = false;
		}
	}

	// Re-load whenever the route flips from placeholder (`/`) to a real
	// structural path, and keep Uppy's endpoint in sync.
	$effect(() => {
		if (routeReady) {
			loadMedia();
			const xhr = uppy?.getPlugin('XHRUpload');
			if (xhr && typeof xhr.setOptions === 'function') {
				xhr.setOptions({ endpoint: getUploadEndpoint() });
			}
		}
	});

	async function handleDelete(item: MediaItem) {
		try {
			if (objectMode) {
				if (!resolvedBase) return;
				await deleteObjectMedia(resolvedBase, item.filename);
			} else {
				await deletePageMedia(route, item.filename);
			}
			mediaItems = mediaItems.filter(m => m.filename !== item.filename);
			onMediaChange?.(mediaItems);
			// Keep a saved ordering coherent after removing a file.
			if (orderActive) emitOrder();
			toast.success(i18n.t('ADMIN_NEXT.TOASTS.FILE_DELETED', { name: item.filename }));
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.TOASTS.FILE_DELETE_FAILED', { name: item.filename }));
		}
	}

	// Drag-and-drop zone handlers
	function handleDragEnter(e: DragEvent) {
		e.preventDefault();
		dragCounter++;
		if (e.dataTransfer?.types.includes('Files')) {
			dragOver = true;
		}
	}

	function handleDragLeave() {
		dragCounter--;
		if (dragCounter <= 0) {
			dragCounter = 0;
			dragOver = false;
		}
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'copy';
		}
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		dragCounter = 0;

		const files = e.dataTransfer?.files;
		if (!files || files.length === 0) return;

		addFilesToUppy(Array.from(files));
	}

	function handleFileInput(e: Event) {
		const input = e.target as HTMLInputElement;
		if (!input.files || input.files.length === 0) return;
		addFilesToUppy(Array.from(input.files));
		input.value = '';
	}

	function addFilesToUppy(files: File[]) {
		if (!uppy) return;
		for (const file of files) {
			try {
				uppy.addFile({
					name: file.name,
					type: file.type,
					data: file,
					source: 'local',
				});
			} catch (err) {
				console.warn('Could not add file:', err);
			}
		}
	}

	// Dragging a tile means different things by mode: reorder within the grid
	// when reorder mode is on, otherwise drag-OUT into the markdown editor.
	function handleTileDragStart(e: DragEvent, item: MediaItem, index: number) {
		if (inReorderMode) {
			handleReorderStart(e, index);
		} else {
			handleThumbnailDragStart(e, item);
		}
	}

	// Drag-OUT: drag media thumbnail into the markdown editor
	function handleThumbnailDragStart(e: DragEvent, item: MediaItem) {
		if (!e.dataTransfer) return;
		const isImage = item.type.startsWith('image/');
		const mdText = isImage
			? `![${item.filename}](${item.filename})`
			: `[${item.filename}](${item.filename})`;
		e.dataTransfer.setData('text/plain', mdText);
		e.dataTransfer.setData('application/x-grav-media', JSON.stringify(item));
		e.dataTransfer.effectAllowed = 'copy';
	}

	// Emit the current ordering to the host as `header.media_order`.
	function emitOrder() {
		onOrderChange?.(mediaItems.map((m) => m.filename));
	}

	// In-grid reorder, with the whole tile as both the drag source and the drag
	// ghost (so the image moves, not a tiny handle — matching 1.7's feel).
	function handleReorderStart(e: DragEvent, index: number) {
		if (!reorderEnabled || !e.dataTransfer) return;
		draggingIndex = index;
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('application/x-grav-reorder', String(index));
		const tile = e.currentTarget as HTMLElement | null;
		if (tile) e.dataTransfer.setDragImage(tile, tile.clientWidth / 2, tile.clientHeight / 2);
	}

	function handleReorderOver(e: DragEvent, index: number) {
		if (draggingIndex === null) return;
		e.preventDefault();
		e.stopPropagation();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		dropPos = e.clientX - rect.left > rect.width / 2 ? 'after' : 'before';
		dragOverIndex = index;
	}

	function handleReorderDrop(e: DragEvent, index: number) {
		if (draggingIndex === null) return;
		e.preventDefault();
		e.stopPropagation();
		const from = draggingIndex;
		const pos = dropPos;
		handleReorderEnd();
		let to = pos === 'after' ? index + 1 : index;
		if (from < to) to -= 1;
		if (from === to) return;
		const next = [...mediaItems];
		const [moved] = next.splice(from, 1);
		next.splice(to, 0, moved);
		mediaItems = next;
		onMediaChange?.(mediaItems);
		emitOrder();
	}

	function handleReorderEnd() {
		draggingIndex = null;
		dragOverIndex = null;
	}

	function resolveUrl(url: string): string {
		const safe = encodeMediaFileUrl(url);
		if (safe.startsWith('http')) return safe;
		return safe.startsWith('/') ? safe : `${auth.serverUrl}/${safe}`;
	}

	function resolveApiUrl(url: string): string {
		if (url.startsWith('http')) return url;
		// API-relative URLs (e.g. /api/v1/thumbnails/...) need serverUrl prefix
		return `${auth.serverUrl}${url}`;
	}

	function getThumbnailUrl(item: MediaItem): string {
		if (item.thumbnail_url) return resolveApiUrl(item.thumbnail_url);
		return resolveUrl(item.url);
	}

	function getMediaUrl(item: MediaItem): string {
		return resolveUrl(item.url);
	}

	function isImage(item: MediaItem): boolean {
		return item.type.startsWith('image/');
	}

	function formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes}B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
	}

	onMount(() => {
		initUppy();
		// The $effect above owns the initial load: it runs once routeReady is
		// (or becomes) true. Calling loadMedia() here too double-fetches media
		// whenever the route is already resolved at mount.
		return () => {
			uppy?.cancelAll();
		};
	});
</script>

<div class="space-y-3">
	<div class="flex items-center justify-between">
		<h3 class="text-sm font-semibold text-foreground">
			{i18n.t('ADMIN_NEXT.MEDIA.PAGE_MEDIA.PAGE_MEDIA')}
			{#if mediaItems.length > 0}
				<span class="ms-1 font-normal text-muted-foreground">({mediaItems.length})</span>
			{/if}
		</h3>
		<div class="flex items-center gap-1">
			{#if canReorder}
				<button
					type="button"
					class="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs transition-colors {reordering
						? 'bg-primary text-primary-foreground hover:bg-primary/90'
						: 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
					aria-pressed={reordering}
					title={i18n.t('ADMIN_NEXT.MEDIA.PAGE_MEDIA.REORDER')}
					onclick={() => (reordering = !reordering)}
				>
					<ArrowUpDown size={13} />
					{reordering
						? i18n.t('ADMIN_NEXT.MEDIA.PAGE_MEDIA.REORDER_DONE')
						: i18n.t('ADMIN_NEXT.MEDIA.PAGE_MEDIA.REORDER_MODE')}
				</button>
			{/if}
			<button
				type="button"
				class="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				onclick={() => fileInputEl?.click()}
			>
				<ImagePlus size={13} />
				Add
			</button>
		</div>
		<input
			bind:this={fileInputEl}
			type="file"
			multiple
			class="hidden"
			onchange={handleFileInput}
		/>
	</div>

	{#if inReorderMode}
		<p class="-mt-1 text-xs text-muted-foreground">
			{i18n.t('ADMIN_NEXT.MEDIA.PAGE_MEDIA.REORDER_HINT')}
		</p>
	{/if}

	<!-- Drop zone + media grid (unified container) -->
	<div
		bind:this={dropzoneEl}
		class="rounded-lg border-2 border-dashed transition-colors {dragOver
			? 'border-primary bg-primary/5'
			: 'border-border hover:border-muted-foreground/40'}"
		ondragenter={handleDragEnter}
		ondragleave={handleDragLeave}
		ondragover={handleDragOver}
		ondrop={handleDrop}
	>
		{#if uploading && uploadProgress.size > 0}
			<!-- Upload progress -->
			<div class="space-y-2 p-3">
				{#each [...uploadProgress] as [id, pct]}
					<div class="space-y-1">
						<div class="flex items-center justify-between text-xs text-muted-foreground">
							<span class="truncate">{uppy?.getFile(id)?.name ?? 'Uploading...'}</span>
							<span>{pct}%</span>
						</div>
						<div class="h-1.5 overflow-hidden rounded-full bg-secondary">
							<div
								class="h-full rounded-full bg-primary transition-[width] duration-200"
								style:width="{pct}%"
							></div>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		<!-- Thumbnail grid -->
		{#if loading}
			<div class="grid grid-cols-3 gap-1.5 p-2">
				{#each [1, 2, 3] as _}
					<div class="aspect-square animate-pulse rounded-md bg-muted"></div>
				{/each}
			</div>
		{:else if mediaItems.length > 0}
			<div class="grid grid-cols-3 gap-1.5 p-2">
				{#each mediaItems as item, index (item.filename)}
					<!-- Outer cell (unclipped) so the insertion line shows in the gap -->
					<div class="relative">
					{#if dragOverIndex === index && draggingIndex !== index}
						<div
							class="pointer-events-none absolute inset-y-0 z-20 w-1 rounded-full bg-primary {dropPos === 'before' ? '-left-1' : '-right-1'}"
						></div>
					{/if}
					<div
						class="group relative aspect-square overflow-hidden rounded-md border bg-muted/50 transition-shadow hover:shadow-md active:cursor-grabbing {inReorderMode
							? 'cursor-move border-primary/50 ring-1 ring-primary/40'
							: 'cursor-grab border-border'} {draggingIndex === index ? 'opacity-40' : ''}"
						draggable="true"
						ondragstart={(e) => handleTileDragStart(e, item, index)}
						ondragend={handleReorderEnd}
						ondragover={(e) => handleReorderOver(e, index)}
						ondrop={(e) => handleReorderDrop(e, index)}
						title={inReorderMode
							? i18n.t('ADMIN_NEXT.MEDIA.PAGE_MEDIA.REORDER')
							: `${item.filename} (${formatSize(item.size)}) — ${i18n.t('ADMIN_NEXT.MEDIA.PAGE_MEDIA.DRAG_INTO_EDITOR')}`}
					>
						{#if isImage(item)}
							<img
								src={getThumbnailUrl(item)}
								alt={item.filename}
								class="h-full w-full object-cover"
								loading="lazy"
							/>
						{:else}
							<div class="flex h-full w-full flex-col items-center justify-center gap-1 p-2">
								<span class="text-lg text-muted-foreground">
									{item.filename.split('.').pop()?.toUpperCase()}
								</span>
								<span class="max-w-full truncate text-[0.625rem] text-muted-foreground">
									{item.filename}
								</span>
							</div>
						{/if}

						<!-- Overlay on hover -->
						<div class="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100">
							<div class="flex w-full items-center justify-between gap-1 p-1.5">
								<span class="min-w-0 flex-1 truncate text-[0.625rem] text-white/90">
									{item.filename}
								</span>
								<div class="flex flex-shrink-0 items-center gap-0.5">
									{#if canEditMeta && !inReorderMode}
										<button
											type="button"
											class="inline-flex h-5 w-5 items-center justify-center rounded-sm text-white/80 transition-colors hover:bg-white/20 hover:text-white"
											onclick={(e) => { e.stopPropagation(); metaItem = item; }}
											title={i18n.t('ADMIN_NEXT.MEDIA.METADATA.EDIT')}
										>
											<Info size={12} />
										</button>
									{/if}
									<button
										type="button"
										class="inline-flex h-5 w-5 items-center justify-center rounded-sm text-white/80 transition-colors hover:bg-red-500 hover:text-white"
										onclick={(e) => { e.stopPropagation(); handleDelete(item); }}
										title={i18n.t('ADMIN_NEXT.DELETE')}
									>
										<X size={12} />
									</button>
								</div>
							</div>
						</div>

					</div>
					</div>
				{/each}
			</div>
		{/if}

		<!-- Drop prompt (always visible at bottom) -->
		<button
			type="button"
			class="flex w-full items-center justify-center gap-1.5 px-3 py-3 text-center"
			onclick={() => fileInputEl?.click()}
		>
			<Upload size={14} class="text-muted-foreground/60" />
			<p class="text-xs text-muted-foreground">
				{dragOver ? 'Drop files here' : mediaItems.length > 0 ? 'Drop or click to add more' : 'Drop files or click to upload'}
			</p>
		</button>
	</div>
</div>

{#if metaItem}
	{@const target = metaItem}
	<MediaMetadataModal
		open={true}
		filename={target.filename}
		load={() => getPageMediaMeta(route, target.filename)}
		save={(values) => savePageMediaMeta(route, target.filename, values)}
		onclose={() => (metaItem = null)}
	/>
{/if}

<style>
	/* Uppy image editor modal styles */
	:global(.uppy-image-editor-container) {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgb(0 0 0 / 0.5);
	}
</style>
