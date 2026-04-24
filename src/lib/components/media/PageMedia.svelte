<script lang="ts">
	import { onMount } from 'svelte';
	import { Uppy } from '@uppy/core';
	import XHRUpload from '@uppy/xhr-upload';
	import ImageEditor from '@uppy/image-editor';
	import { auth } from '$lib/stores/auth.svelte';
	import { api } from '$lib/api/client';
	import { invalidations } from '$lib/stores/invalidation.svelte';
	import { getPageMedia, deletePageMedia, type MediaItem } from '$lib/api/endpoints/media';
	import { toast } from 'svelte-sonner';
	import { Upload, X, ImagePlus, GripVertical } from 'lucide-svelte';

	interface Props {
		route: string;
		onMediaChange?: (items: MediaItem[]) => void;
		/** External media items from shared context — when updated externally, syncs into local state */
		externalItems?: MediaItem[];
	}

	let { route, onMediaChange, externalItems }: Props = $props();

	let mediaItems = $state<MediaItem[]>([]);

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
	const routeReady = $derived(route !== '' && route !== '/');

	function getUploadEndpoint() {
		if (!routeReady) return `${auth.serverUrl}${auth.apiPrefix}/pages/__unresolved__/media`;
		const cleanRoute = route.startsWith('/') ? route.slice(1) : route;
		return `${auth.serverUrl}${auth.apiPrefix}/pages/${cleanRoute}/media`;
	}

	function getAuthHeaders(): Record<string, string> {
		const h: Record<string, string> = {};
		if (auth.accessToken) h['X-API-Token'] = auth.accessToken;
		if (auth.environment) h['X-Grav-Environment'] = auth.environment;
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

		uppy.on('upload-error', (file, error) => {
			toast.error(`Failed to upload ${file?.name ?? 'file'}: ${error.message}`);
		});

		uppy.on('complete', () => {
			uploading = false;
			uploadProgress = new Map();
			// XHRUpload bypasses our API client, so emit invalidation manually.
			invalidations.emit([`media:update:pages/${route}`, `pages:update:/${route}`]);
			// Refresh media list after uploads complete
			loadMedia();
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

	async function loadMedia() {
		if (!routeReady) {
			// Host is still resolving the home alias; defer until route is
			// a concrete structural path. An $effect below re-fires loadMedia
			// the moment it becomes ready.
			return;
		}
		try {
			mediaItems = await getPageMedia(route);
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
			await deletePageMedia(route, item.filename);
			mediaItems = mediaItems.filter(m => m.filename !== item.filename);
			onMediaChange?.(mediaItems);
			toast.success(`Deleted ${item.filename}`);
		} catch {
			toast.error(`Failed to delete ${item.filename}`);
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

	function resolveUrl(url: string): string {
		if (url.startsWith('http')) return url;
		return url.startsWith('/') ? url : `${auth.serverUrl}/${url}`;
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
		// Initial load — `loadMedia` is a no-op if the route isn't resolved
		// yet. The $effect above re-fires it once routeReady flips true.
		loadMedia();
		return () => {
			uppy?.cancelAll();
		};
	});
</script>

<div class="space-y-3">
	<div class="flex items-center justify-between">
		<h3 class="text-sm font-semibold text-foreground">
			Page Media
			{#if mediaItems.length > 0}
				<span class="ml-1 font-normal text-muted-foreground">({mediaItems.length})</span>
			{/if}
		</h3>
		<button
			type="button"
			class="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
			onclick={() => fileInputEl?.click()}
		>
			<ImagePlus size={13} />
			Add
		</button>
		<input
			bind:this={fileInputEl}
			type="file"
			multiple
			class="hidden"
			onchange={handleFileInput}
		/>
	</div>

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
				{#each mediaItems as item (item.filename)}
					<div
						class="group relative aspect-square cursor-grab overflow-hidden rounded-md border border-border bg-muted/50 transition-shadow hover:shadow-md active:cursor-grabbing"
						draggable="true"
						ondragstart={(e) => handleThumbnailDragStart(e, item)}
						title="{item.filename} ({formatSize(item.size)}) — Drag into editor"
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
								<span class="max-w-full truncate text-[10px] text-muted-foreground">
									{item.filename}
								</span>
							</div>
						{/if}

						<!-- Overlay on hover -->
						<div class="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100">
							<div class="flex w-full items-center justify-between p-1.5">
								<span class="max-w-[calc(100%-24px)] truncate text-[10px] text-white/90">
									{item.filename}
								</span>
								<button
									type="button"
									class="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-sm text-white/80 transition-colors hover:bg-red-500 hover:text-white"
									onclick={(e) => { e.stopPropagation(); handleDelete(item); }}
									title="Delete"
								>
									<X size={12} />
								</button>
							</div>
						</div>

						<!-- Drag grip indicator -->
						<div class="absolute right-1 top-1 rounded bg-black/30 p-0.5 opacity-0 transition-opacity group-hover:opacity-100">
							<GripVertical size={10} class="text-white/80" />
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
