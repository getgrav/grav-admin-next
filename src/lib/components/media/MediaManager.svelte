<script lang="ts">
	import { onMount } from 'svelte';
	import { Uppy } from '@uppy/core';
	import XHRUpload from '@uppy/xhr-upload';
	import ImageEditor from '@uppy/image-editor';
	import { auth } from '$lib/stores/auth.svelte';
	import { mediaManager } from '$lib/stores/mediaManager.svelte';
	import type { MediaItem } from '$lib/api/endpoints/media';
	import { toast } from 'svelte-sonner';
	import { Upload, Loader2, FolderOpen } from 'lucide-svelte';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import MediaToolbar from './MediaToolbar.svelte';
	import MediaGrid from './MediaGrid.svelte';
	import MediaList from './MediaList.svelte';
	import MediaInspector from './MediaInspector.svelte';

	// Upload state
	let uploading = $state(false);
	let uploadProgress = $state<Map<string, number>>(new Map());
	let dragOver = $state(false);
	let dragCounter = $state(0);

	// Modals
	let deleteModalOpen = $state(false);
	let deleteTarget = $state<MediaItem | null>(null);
	let deleteMessage = $state('');
	let bulkDeleting = $state(false);
	let newFolderModalOpen = $state(false);
	let newFolderName = $state('');

	// Refs
	let fileInputEl: HTMLInputElement;
	let uppy: Uppy | undefined;

	function getUploadEndpoint() {
		const path = mediaManager.currentPath;
		const base = `${auth.serverUrl}${auth.apiPrefix}/media`;
		return path ? `${base}?path=${encodeURIComponent(path)}` : base;
	}

	function getAuthHeaders(): Record<string, string> {
		const h: Record<string, string> = {};
		if (auth.accessToken) h['Authorization'] = `Bearer ${auth.accessToken}`;
		if (auth.environment) h['X-Grav-Environment'] = auth.environment;
		return h;
	}

	function initUppy() {
		uppy = new Uppy({
			id: 'site-media',
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

		uppy.on('upload-start', () => {
			uploading = true;
		});

		uppy.on('upload-progress', (file, progress) => {
			if (file) {
				const total = progress.bytesTotal ?? 0;
				const pct = total > 0 ? Math.round((progress.bytesUploaded / total) * 100) : 0;
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

		uppy.on('complete', (result) => {
			uploading = false;
			uploadProgress = new Map();
			const count = result?.successful?.length ?? 0;
			if (count > 0) {
				toast.success(`Uploaded ${count} file${count !== 1 ? 's' : ''}`);
			}
			mediaManager.refresh();
			uppy?.cancelAll();
		});
	}

	// Update XHR endpoint when path changes
	$effect(() => {
		const _path = mediaManager.currentPath;
		if (uppy) {
			const plugin = uppy.getPlugin('XHRUpload');
			if (plugin) {
				(plugin as any).opts.endpoint = getUploadEndpoint();
			}
		}
	});

	function addFilesToUppy(files: File[]) {
		if (!uppy) return;
		for (const file of files) {
			try {
				uppy.addFile({ name: file.name, type: file.type, data: file, source: 'local' });
			} catch (err) {
				console.warn('Could not add file:', err);
			}
		}
	}

	// Drag-and-drop handlers
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
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
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

	// Toolbar actions
	function handleUploadClick() {
		fileInputEl?.click();
	}

	function handleNewFolder() {
		newFolderName = '';
		newFolderModalOpen = true;
	}

	async function submitNewFolder() {
		if (!newFolderName.trim()) return;
		try {
			await mediaManager.createFolder(newFolderName.trim());
			toast.success(`Folder "${newFolderName.trim()}" created`);
			newFolderModalOpen = false;
		} catch (err) {
			toast.error(`Failed to create folder: ${err instanceof Error ? err.message : 'Unknown error'}`);
		}
	}

	function handleDeleteFile(file: MediaItem) {
		deleteTarget = file;
		deleteMessage = `Delete "${file.filename}"? This cannot be undone.`;
		bulkDeleting = false;
		deleteModalOpen = true;
	}

	function handleDeleteSelected() {
		const count = mediaManager.selectedFiles.size;
		deleteTarget = null;
		deleteMessage = `Delete ${count} selected file${count !== 1 ? 's' : ''}? This cannot be undone.`;
		bulkDeleting = true;
		deleteModalOpen = true;
	}

	async function confirmDelete() {
		deleteModalOpen = false;
		try {
			if (bulkDeleting) {
				const errors = await mediaManager.deleteSelected();
				if (errors.length > 0) {
					toast.error(`Failed to delete ${errors.length} file(s)`);
				} else {
					toast.success('Files deleted');
				}
			} else if (deleteTarget) {
				await mediaManager.deleteFile(deleteTarget);
				toast.success(`Deleted ${deleteTarget.filename}`);
			}
		} catch (err) {
			toast.error(`Delete failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
		}
	}

	// Keyboard shortcuts
	function handleKeydown(e: KeyboardEvent) {
		// Don't capture when in an input
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

		if (e.key === 'Escape') {
			if (mediaManager.inspectedFile) {
				mediaManager.inspectFile(null);
			} else {
				mediaManager.clearSelection();
			}
		} else if (e.key === 'ArrowLeft') {
			mediaManager.navigateInspector('prev');
			e.preventDefault();
		} else if (e.key === 'ArrowRight') {
			mediaManager.navigateInspector('next');
			e.preventDefault();
		} else if ((e.key === 'Delete' || e.key === 'Backspace') && mediaManager.selectedFiles.size > 0) {
			handleDeleteSelected();
			e.preventDefault();
		} else if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
			mediaManager.selectAll();
			e.preventDefault();
		}
	}

	const hasContent = $derived(mediaManager.files.length > 0 || mediaManager.folders.length > 0);

	onMount(() => {
		initUppy();
		mediaManager.navigateTo('');
		return () => {
			uppy?.cancelAll();
		};
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<input
	bind:this={fileInputEl}
	type="file"
	multiple
	class="hidden"
	onchange={handleFileInput}
/>

<div class="flex h-full flex-col">
	<MediaToolbar
		onupload={handleUploadClick}
		onnewfolder={handleNewFolder}
		ondeleteselected={handleDeleteSelected}
	/>

	<!-- Main content area with drop zone -->
	<div
		class="relative flex flex-1 overflow-hidden"
		ondragenter={handleDragEnter}
		ondragleave={handleDragLeave}
		ondragover={handleDragOver}
		ondrop={handleDrop}
	>
		<!-- Content panel -->
		<div class="flex-1 overflow-y-auto">
			{#if mediaManager.loading}
				<div class="flex h-64 items-center justify-center">
					<Loader2 size={24} class="animate-spin text-muted-foreground" />
				</div>
			{:else if !hasContent}
				<!-- Empty state -->
				<div class="flex h-64 flex-col items-center justify-center gap-3 text-center">
					<div class="flex h-14 w-14 items-center justify-center rounded-xl bg-muted">
						<FolderOpen size={24} class="text-muted-foreground" />
					</div>
					<div>
						<p class="text-sm font-medium text-foreground">
							{mediaManager.isSearching ? 'No results found' : 'This folder is empty'}
						</p>
						<p class="mt-1 text-xs text-muted-foreground">
							{mediaManager.isSearching
								? 'Try a different search term'
								: 'Drop files here or click Upload to get started'}
						</p>
					</div>
					{#if !mediaManager.isSearching}
						<button
							class="mt-2 inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
							onclick={handleUploadClick}
						>
							<Upload size={14} />
							Upload Files
						</button>
					{/if}
				</div>
			{:else if mediaManager.viewMode === 'grid'}
				<MediaGrid />
			{:else}
				<MediaList />
			{/if}

			<!-- Upload progress -->
			{#if uploading && uploadProgress.size > 0}
				<div class="border-t border-border bg-card px-4 py-3">
					<div class="space-y-2">
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
				</div>
			{/if}
		</div>

		<!-- Inspector panel -->
		{#if mediaManager.inspectedFile}
			<div class="hidden w-[320px] shrink-0 lg:block">
				<MediaInspector file={mediaManager.inspectedFile} ondelete={handleDeleteFile} />
			</div>
		{/if}

		<!-- Drag overlay -->
		{#if dragOver}
			<div class="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
				<div class="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-primary/50 bg-primary/5 px-12 py-8">
					<Upload size={32} class="text-primary" />
					<p class="text-sm font-medium text-primary">
						Drop files to upload
						{#if mediaManager.currentPath}
							to <span class="font-semibold">{mediaManager.currentPath}</span>
						{/if}
					</p>
				</div>
			</div>
		{/if}
	</div>
</div>

<!-- Delete confirmation -->
<ConfirmModal
	open={deleteModalOpen}
	title="Delete"
	message={deleteMessage}
	confirmLabel="Delete"
	variant="destructive"
	onconfirm={confirmDelete}
	oncancel={() => deleteModalOpen = false}
/>

<!-- New folder dialog -->
{#if newFolderModalOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/75 p-4 backdrop-blur-sm"
		onclick={(e) => { if (e.target === e.currentTarget) newFolderModalOpen = false; }}
	>
		<div class="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl">
			<h3 class="text-base font-semibold text-foreground">New Folder</h3>
			<p class="mt-1 text-xs text-muted-foreground">
				{mediaManager.currentPath
					? `Create in ${mediaManager.currentPath}/`
					: 'Create in root'}
			</p>
			<input
				class="mt-4 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
				placeholder="Folder name"
				bind:value={newFolderName}
				onkeydown={(e) => { if (e.key === 'Enter') submitNewFolder(); if (e.key === 'Escape') newFolderModalOpen = false; }}
			/>
			<div class="mt-4 flex justify-end gap-2">
				<button
					class="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
					onclick={() => newFolderModalOpen = false}
				>
					Cancel
				</button>
				<button
					class="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
					onclick={submitNewFolder}
					disabled={!newFolderName.trim()}
				>
					Create
				</button>
			</div>
		</div>
	</div>
{/if}
