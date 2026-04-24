<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import type { MediaItem } from '$lib/api/endpoints/media';
	import type { PageMediaContext } from '$lib/components/media/types';
	import { getContext, onMount } from 'svelte';
	import { Uppy } from '@uppy/core';
	import XHRUpload from '@uppy/xhr-upload';
	import { auth } from '$lib/stores/auth.svelte';
	import { api } from '$lib/api/client';
	import { invalidations } from '$lib/stores/invalidation.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { useFormCommit } from '$lib/utils/form-commit.svelte';
	import { toast } from 'svelte-sonner';
	import { Upload, X } from 'lucide-svelte';

	interface Props {
		field: BlueprintField;
		value: unknown;
		onchange: (value: unknown) => void;
	}

	/**
	 * Grav stores file field data as a keyed object:
	 *   { "user/pages/slug/photo.png": { name, type, size, path } }
	 * The key is the full relative path, value is file metadata.
	 */
	interface FileEntry {
		name: string;
		type: string;
		size: number;
		path: string;
	}

	let { field, value, onchange }: Props = $props();
	const translateLabel = i18n.tMaybe;
	const getRoute = getContext<(() => string) | undefined>('pageRoute');
	const mediaCtx = getContext<PageMediaContext | undefined>('pageMediaItems');
	// Owning scope for `self@:` resolution on the blueprint-upload endpoint.
	// Set by the host route (plugins/<slug>, themes/<slug>, pages/<route>,
	// users/<username>). Undefined when a destination isn't needed (legacy
	// page-media path still works without scope context).
	const getBlueprintScope = getContext<(() => string) | undefined>('blueprintScope');
	// Defer on-disk deletes until the enclosing form actually saves — eager
	// deletes leave orphan state when the user cancels (YAML still references
	// the file, file is gone).
	const formCommit = useFormCommit();

	// Paths the user has clicked ✕ on but haven't been saved yet. Committed
	// via formCommit.register() when the containing form saves.
	const pendingDeletes = new Set<string>();

	// `destination` on the blueprint field routes uploads through the
	// destination-aware endpoint; absent, we fall back to the legacy
	// page-media endpoint (which requires a page route).
	const destination = $derived(field.destination ?? '');
	const useBlueprintUpload = $derived(destination !== '');

	let uploading = $state(false);
	let uploadProgress = $state(0);
	let dragOver = $state(false);
	let fileInputEl = $state<HTMLInputElement | null>(null);
	let uppy: Uppy | undefined;

	// Parse the Grav file field format into a displayable list
	// Input format: { "path/to/file.png": { name, type, size, path } }
	// Also handles legacy simple formats: string, string[], or flat arrays
	const fileEntries = $derived.by((): Array<{ key: string; entry: FileEntry }> => {
		if (!value || (typeof value === 'object' && Object.keys(value as object).length === 0)) return [];

		// Standard Grav format: keyed object
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			const obj = value as Record<string, unknown>;
			const entries: Array<{ key: string; entry: FileEntry }> = [];
			for (const [key, val] of Object.entries(obj)) {
				if (val && typeof val === 'object' && 'name' in val) {
					entries.push({ key, entry: val as FileEntry });
				}
			}
			if (entries.length > 0) return entries;
		}

		// Legacy/simple format fallback: try to build entries from media context
		const names = parseSimpleValue(value);
		return names.map((name) => {
			const mediaItem = (mediaCtx?.items ?? []).find((m) => m.filename === name);
			const path = buildPath(name);
			return {
				key: path,
				entry: {
					name,
					type: mediaItem?.type ?? 'application/octet-stream',
					size: mediaItem?.size ?? 0,
					path,
				},
			};
		});
	});

	function parseSimpleValue(val: unknown): string[] {
		if (Array.isArray(val)) return val.filter((v): v is string => typeof v === 'string' && v !== '');
		if (typeof val === 'string' && val) return [val];
		return [];
	}

	function buildPath(filename: string): string {
		const route = getRoute?.() ?? '';
		const cleanRoute = route.startsWith('/') ? route.slice(1) : route;
		// Approximate the Grav page path — the server will have the exact path
		return `user/pages/${cleanRoute}/${filename}`;
	}

	function getUploadEndpoint(): string {
		if (useBlueprintUpload) {
			return `${auth.serverUrl}${auth.apiPrefix}/blueprint-upload`;
		}
		const route = getRoute?.() ?? '';
		const cleanRoute = route.startsWith('/') ? route.slice(1) : route;
		return `${auth.serverUrl}${auth.apiPrefix}/pages/${cleanRoute}/media`;
	}

	function getAuthHeaders(): Record<string, string> {
		const h: Record<string, string> = {};
		if (auth.accessToken) h['X-API-Token'] = auth.accessToken;
		if (auth.environment) h['X-Grav-Environment'] = auth.environment;
		return h;
	}

	function getAcceptString(): string {
		if (!field.accept || field.accept.length === 0) return '';
		return field.accept.join(',');
	}

	// Build the Grav-compatible file field value
	function buildGravValue(entries: Array<{ key: string; entry: FileEntry }>): Record<string, FileEntry> {
		const result: Record<string, FileEntry> = {};
		for (const { key, entry } of entries) {
			result[key] = entry;
		}
		return result;
	}

	function initUppy() {
		uppy = new Uppy({
			id: `file-field-${field.name}`,
			autoProceed: true,
			restrictions: {
				maxFileSize: 64 * 1024 * 1024,
				allowedFileTypes: field.accept?.length ? field.accept : undefined,
			},
		});

		// When using the blueprint-upload endpoint we also need to pass the
		// destination + scope on every request so the server can resolve
		// `self@:` relative to the owning plugin/theme/page. XHRUpload supports
		// `formData: true` + `metaFields` for this — we just stuff the two
		// values into Uppy meta and whitelist them for upload.
		if (useBlueprintUpload) {
			uppy.setMeta({ destination, scope: getBlueprintScope?.() ?? '' });
		}

		uppy.use(XHRUpload, {
			endpoint: getUploadEndpoint(),
			fieldName: 'file',
			headers: getAuthHeaders,
			formData: true,
			allowedMetaFields: useBlueprintUpload ? ['destination', 'scope'] : [],
		});

		// Pre-check token so Uppy's XHR uploads don't fail silently on expiry.
		uppy.addPreProcessor(async () => {
			await api.ensureAuth();
		});

		uppy.on('upload-start', () => { uploading = true; });
		uppy.on('upload-progress', (_file, progress) => {
			const total = progress.bytesTotal ?? 0;
			uploadProgress = total > 0 ? Math.round((progress.bytesUploaded / total) * 100) : 0;
		});

		uppy.on('upload-success', (file, response) => {
			if (!file) return;

			// For blueprint uploads the server returns the authoritative
			// Grav-root-relative path; use it directly so deletes can round-
			// trip. For page-media uploads, fall back to the heuristic path.
			let path = buildPath(file.name);
			if (useBlueprintUpload) {
				const body = response?.body as { data?: Array<{ path?: string; name?: string }> } | undefined;
				const saved = body?.data?.find((d) => d.name === file.name) ?? body?.data?.[0];
				if (saved?.path) path = saved.path;
			}

			const newEntry = {
				key: path,
				entry: {
					name: file.name,
					type: file.type ?? 'application/octet-stream',
					size: file.size ?? 0,
					path,
				},
			};

			if (field.multiple) {
				onchange(buildGravValue([...fileEntries, newEntry]));
			} else {
				onchange(buildGravValue([newEntry]));
			}
		});

		uppy.on('upload-error', (file, error) => {
			toast.error(`Failed to upload ${file?.name ?? 'file'}: ${error.message}`);
		});

		uppy.on('complete', () => {
			uploading = false;
			uploadProgress = 0;
			uppy?.cancelAll();

			// Page-media path: invalidate the page's media + refresh the
			// shared context so filepickers in the same form see the new
			// file. Blueprint-upload path writes outside page media, so
			// neither of those is meaningful here.
			if (useBlueprintUpload) return;

			const route = getRoute?.() ?? '';
			const cleanRoute = route.startsWith('/') ? route.slice(1) : route;
			// XHRUpload bypasses our API client — emit invalidation manually.
			invalidations.emit([`media:update:pages/${cleanRoute}`, `pages:update:/${cleanRoute}`]);
			// Refresh the shared media context so filepickers see the new file
			if (mediaCtx) {
				import('$lib/api/endpoints/media').then(({ getPageMedia }) => {
					getPageMedia(route).then((items) => mediaCtx.update(items));
				});
			}
		});
	}

	function findMediaItem(filename: string): MediaItem | undefined {
		return (mediaCtx?.items ?? []).find((m) => m.filename === filename);
	}

	function getThumbnailUrl(item: MediaItem): string {
		if (item.thumbnail_url) {
			const url = item.thumbnail_url;
			return url.startsWith('http') ? url : `${auth.serverUrl}${url}`;
		}
		const url = item.url;
		if (url.startsWith('http')) return url;
		return url.startsWith('/') ? url : `${auth.serverUrl}/${url}`;
	}

	function addFiles(fileList: File[]) {
		if (!uppy) return;
		for (const file of fileList) {
			try {
				uppy.addFile({ name: file.name, type: file.type, data: file, source: 'local' });
			} catch (err) {
				console.warn('Could not add file:', err);
			}
		}
	}

	function removeFile(key: string) {
		// Capture the path BEFORE mutating state — fileEntries is $derived
		// from value, so once we call onchange() the entry is already gone
		// from fileEntries and the lookup below would find nothing.
		const removed = fileEntries.find((e) => e.key === key);
		const removedPath = removed?.entry.path ?? '';

		const remaining = fileEntries.filter((e) => e.key !== key);
		if (remaining.length === 0) {
			onchange({});
		} else {
			onchange(buildGravValue(remaining));
		}

		// For blueprint uploads, defer the actual unlink to the form's save
		// commit. If the user cancels / reloads before saving, the YAML still
		// references the file — so the file must still exist, or the form
		// will show a broken reference. Page-media uploads are managed by
		// the page itself and don't queue for deletion.
		if (useBlueprintUpload && removedPath) {
			pendingDeletes.add(removedPath);
		}
	}

	$effect(() => {
		if (!formCommit) return;
		return formCommit.register(async () => {
			if (pendingDeletes.size === 0) return;
			const paths = [...pendingDeletes];
			pendingDeletes.clear();
			const { deleteBlueprintFile } = await import('$lib/api/endpoints/media');
			for (const path of paths) {
				try {
					await deleteBlueprintFile(path);
				} catch (err) {
					console.warn('[FileField] Failed to delete file on server:', err);
				}
			}
		});
	});

	// Auto-remove entries whose files no longer exist in media
	$effect(() => {
		const items = mediaCtx?.items;
		if (!items || items.length === 0 || fileEntries.length === 0) return;
		const mediaNames = new Set(items.map((m) => m.filename));
		const surviving = fileEntries.filter((e) => mediaNames.has(e.entry.name));
		if (surviving.length !== fileEntries.length) {
			if (surviving.length === 0) {
				onchange({});
			} else {
				onchange(buildGravValue(surviving));
			}
		}
	});

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		const droppedFiles = e.dataTransfer?.files;
		if (droppedFiles) addFiles(Array.from(droppedFiles));
	}

	function handleFileInput(e: Event) {
		const input = e.target as HTMLInputElement;
		if (input.files) addFiles(Array.from(input.files));
		input.value = '';
	}

	onMount(() => {
		initUppy();
		return () => uppy?.cancelAll();
	});
</script>

<div class="space-y-2">
	{#if field.label || field.help}
		<div>
			{#if field.label}
				<label class="text-sm font-semibold text-foreground">
					{translateLabel(field.label)}
				</label>
			{/if}
			{#if field.help}
				<p class="mt-0.5 text-xs text-muted-foreground">{translateLabel(field.help)}</p>
			{/if}
		</div>
	{/if}

	<!-- Current files -->
	{#if fileEntries.length > 0}
		<div class="space-y-1">
			{#each fileEntries as { key, entry } (key)}
				{@const mediaItem = findMediaItem(entry.name)}
				<div class="flex items-center gap-2.5 rounded-md border border-border bg-muted/30 px-2 py-1.5">
					{#if mediaItem && mediaItem.type.startsWith('image/')}
						<img
							src={getThumbnailUrl(mediaItem)}
							alt={entry.name}
							class="h-8 w-8 shrink-0 rounded border border-border object-cover"
						/>
					{:else}
						<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-semibold text-muted-foreground">
							{entry.name.split('.').pop()?.toUpperCase().slice(0, 4) ?? ''}
						</div>
					{/if}
					<span class="flex-1 truncate text-sm text-foreground">{entry.name}</span>
					<button
						type="button"
						class="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
						onclick={() => removeFile(key)}
					>
						<X size={14} />
					</button>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Upload zone -->
	{#if field.multiple || fileEntries.length === 0}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed px-4 py-4 text-center transition-colors {dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/40'}"
			ondragover={(e) => { e.preventDefault(); dragOver = true; }}
			ondragleave={() => { dragOver = false; }}
			ondrop={handleDrop}
			onclick={() => fileInputEl?.click()}
			role="button"
			tabindex={0}
			onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputEl?.click(); }}
		>
			{#if uploading}
				<div class="w-full space-y-1">
					<div class="text-xs text-muted-foreground">Uploading... {uploadProgress}%</div>
					<div class="h-1.5 overflow-hidden rounded-full bg-secondary">
						<div
							class="h-full rounded-full bg-primary transition-[width] duration-200"
							style:width="{uploadProgress}%"
						></div>
					</div>
				</div>
			{:else}
				<Upload size={16} class="text-muted-foreground/60" />
				<p class="text-xs text-muted-foreground">
					{dragOver ? 'Drop file here' : 'Drop file or click to upload'}
				</p>
				{#if field.accept?.length}
					<p class="text-[10px] text-muted-foreground/60">
						{field.accept.join(', ')}
					</p>
				{/if}
			{/if}
		</div>
		<input
			bind:this={fileInputEl}
			type="file"
			class="hidden"
			accept={getAcceptString()}
			multiple={!!field.multiple}
			onchange={handleFileInput}
		/>
	{/if}
</div>
