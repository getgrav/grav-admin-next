<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { sanitizeHtml } from '$lib/utils/markdown';
	import { encodeMediaFileUrl, type MediaItem } from '$lib/api/endpoints/media';
	import type { PageMediaContext, MediaSource } from '$lib/components/media/types';
	import { getContext, onMount } from 'svelte';
	import { Uppy } from '@uppy/core';
	import XHRUpload from '@uppy/xhr-upload';
	import { auth } from '$lib/stores/auth.svelte';
	import { api } from '$lib/api/client';
	import { invalidations } from '$lib/stores/invalidation.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { useFormCommit } from '$lib/utils/form-commit.svelte';
	import { toast } from 'svelte-sonner';
	import { uploadErrorMessage } from '$lib/utils/upload-error';
	import { canWrite } from '$lib/utils/permissions';
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
		// Public URL for the file, when the server returns one (blueprint /
		// destination uploads live outside the object's media collection, so a
		// preview can't be resolved from `pageMediaItems` — we keep the URL here).
		url?: string;
	}

	let { field, value, onchange }: Props = $props();
	// A file field uploads through the media endpoints, so gate it on media-write.
	// Prevents a read-only/demo account from writing a file to disk on drop
	// (uploads are immediate/autoProceed, independent of the form's Save button).
	const locked = $derived(!canWrite('media'));
	const translateLabel = i18n.tMaybe;
	const getRoute = getContext<(() => string) | undefined>('pageRoute');
	// Non-page media source (e.g. a flex object). When present, uploads/deletes
	// target the object's media endpoint instead of the page-media path.
	const getMediaSource = getContext<(() => MediaSource) | undefined>('mediaSource');
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

	// Filenames uploaded in this session. The "auto-remove dangling entries"
	// effect reconciles the field value against the object's media list, but
	// that list refreshes asynchronously after an upload — without this guard a
	// freshly uploaded file would be pruned before the media list catches up
	// (the reported "first upload isn't recorded, Save stays disabled").
	const uploadedNames = new Set<string>();

	// `destination` on the blueprint field routes uploads through the
	// destination-aware endpoint; absent, we fall back to the legacy
	// page-media endpoint (which requires a page route).
	const destination = $derived(field.destination ?? '');
	// Resolved relative API base for a non-page source (e.g. flex object).
	const mediaSource = $derived(getMediaSource?.());
	const mediaApiBase = $derived(mediaSource?.apiBase ?? null);
	// `self@` means "this object's own media folder". For a flex object that's
	// exactly what the object media endpoint (mediaApiBase) targets — and the
	// generic blueprint-upload path can't resolve `self@` without page/plugin/
	// theme/user scope context (it throws "scope '' is not a supported owner").
	// So when an object media source is present, treat self@ as object-local and
	// upload straight to the object endpoint instead of /blueprint-upload.
	const isSelfDestination = $derived(
		['self@', 'self@:', '@self', '@self@'].includes(destination.replace(/\/+$/, '')),
	);
	const useObjectMediaForSelf = $derived(isSelfDestination && !!mediaApiBase);
	const useBlueprintUpload = $derived(destination !== '' && !useObjectMediaForSelf);

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
		// Object media (flex, etc.) lives in the object's own media folder, so
		// the file-field value is keyed by the bare filename relative to that
		// folder — matching Grav's parseFileProperty (`path => filename`).
		if (mediaApiBase) return filename;
		const route = getRoute?.() ?? '';
		const cleanRoute = route.startsWith('/') ? route.slice(1) : route;
		// Approximate the Grav page path — the server will have the exact path
		return `user/pages/${cleanRoute}/${filename}`;
	}

	function getUploadEndpoint(): string {
		if (useBlueprintUpload) {
			return `${auth.serverUrl}${auth.apiPrefix}/blueprint-upload`;
		}
		if (mediaApiBase) {
			return `${auth.serverUrl}${auth.apiPrefix}/${mediaApiBase}/media`;
		}
		const route = getRoute?.() ?? '';
		const cleanRoute = route.startsWith('/') ? route.slice(1) : route;
		return `${auth.serverUrl}${auth.apiPrefix}/pages/${cleanRoute}/media`;
	}

	function getAuthHeaders(): Record<string, string> {
		const h: Record<string, string> = {};
		if (auth.accessToken) h['X-API-Token'] = auth.accessToken;
		h['X-Grav-Environment'] = auth.gravEnvironment;
		return h;
	}

	function getAcceptString(): string {
		if (!field.accept || field.accept.length === 0) return '';
		return field.accept.join(',');
	}

	// Per-field upload settings forwarded to the server so admin-next honors
	// the same blueprint attributes admin-classic does (random_name,
	// avoid_overwriting, accept, filesize). Values are stringified for
	// multipart form metadata; the server treats absent keys as defaults.
	function getUploadSettingsMeta(): Record<string, string> {
		const meta: Record<string, string> = {};
		if (field.random_name) meta.random_name = '1';
		if (field.avoid_overwriting) meta.avoid_overwriting = '1';
		if (field.accept?.length) meta.accept = field.accept.join(',');
		if (typeof field.filesize === 'number' && field.filesize > 0) {
			meta.filesize = String(field.filesize);
		}
		return meta;
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
		// Cap the client-side size restriction at the field's own filesize
		// (MB) when smaller than the hard 64 MB ceiling, so the user gets an
		// immediate rejection rather than a round-trip error.
		const hardMax = 64 * 1024 * 1024;
		const fieldMax =
			typeof field.filesize === 'number' && field.filesize > 0
				? field.filesize * 1024 * 1024
				: hardMax;

		uppy = new Uppy({
			id: `file-field-${field.name}`,
			autoProceed: true,
			restrictions: {
				maxFileSize: Math.min(hardMax, fieldMax),
				allowedFileTypes: field.accept?.length ? field.accept : undefined,
			},
		});

		// Forward the field's upload settings on every request. When using the
		// blueprint-upload endpoint we additionally pass destination + scope so
		// the server can resolve `self@:` relative to the owning plugin/theme/
		// page. XHRUpload supports `formData: true` + `allowedMetaFields` for
		// this — we stuff the values into Uppy meta and whitelist them.
		const settingsMeta = getUploadSettingsMeta();
		const meta: Record<string, string> = { ...settingsMeta };
		if (useBlueprintUpload) {
			meta.destination = destination;
			meta.scope = getBlueprintScope?.() ?? '';
		}
		uppy.setMeta(meta);

		uppy.use(XHRUpload, {
			endpoint: getUploadEndpoint(),
			fieldName: 'file',
			headers: getAuthHeaders,
			formData: true,
			allowedMetaFields: [
				...Object.keys(settingsMeta),
				...(useBlueprintUpload ? ['destination', 'scope'] : []),
			],
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
			let url: string | undefined;
			if (useBlueprintUpload) {
				const body = response?.body as
					| { data?: Array<{ path?: string; name?: string; url?: string }> }
					| undefined;
				const saved = body?.data?.find((d) => d.name === file.name) ?? body?.data?.[0];
				if (saved?.path) path = saved.path;
				// Keep the server URL so the preview resolves even though a
				// destination upload lives outside the object's media list.
				if (saved?.url) url = saved.url;
			}

			// Protect this file from the async "auto-remove dangling entries"
			// reconciliation until the media list refreshes (see uploadedNames).
			uploadedNames.add(file.name);

			const newEntry = {
				key: path,
				entry: {
					name: file.name,
					type: file.type ?? 'application/octet-stream',
					size: file.size ?? 0,
					path,
					...(url ? { url } : {}),
				},
			};

			if (field.multiple) {
				onchange(buildGravValue([...fileEntries, newEntry]));
			} else {
				onchange(buildGravValue([newEntry]));
			}
		});

		uppy.on('upload-error', (file, error, request) => {
			const message = uploadErrorMessage(error, request as XMLHttpRequest | undefined);
			toast.error(`Failed to upload ${file?.name ?? 'file'}: ${message}`);
		});

		uppy.on('complete', () => {
			uploading = false;
			uploadProgress = 0;
			uppy?.cancelAll();

			// Invalidate the owning object's media + refresh the shared context
			// so filepickers in the same form see the new file. Blueprint-upload
			// path writes outside object media, so neither is meaningful here.
			if (useBlueprintUpload) return;

			// Object media source (flex, etc.): emit its invalidation channels
			// and refresh the shared context from the object's media endpoint.
			if (mediaApiBase) {
				// XHRUpload bypasses our API client — emit invalidation manually.
				invalidations.emit(mediaSource?.invalidationKeys ?? []);
				if (mediaCtx) {
					const base = mediaApiBase;
					import('$lib/api/endpoints/media').then(({ getObjectMedia }) => {
						getObjectMedia(base).then((items) => mediaCtx.update(items));
					});
				}
				return;
			}

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
		const url = encodeMediaFileUrl(item.url);
		if (url.startsWith('http')) return url;
		return url.startsWith('/') ? url : `${auth.serverUrl}/${url}`;
	}

	const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico'];

	function isImageEntry(entry: FileEntry): boolean {
		if (entry.type?.startsWith('image/')) return true;
		const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
		return IMAGE_EXTENSIONS.includes(ext);
	}

	// Resolve a preview image URL for an entry, or null to fall back to the
	// extension badge. Prefers the object media list (thumbnails), then a
	// server-provided URL kept on the entry (destination/media:// uploads that
	// never appear in the object media list).
	function getEntryImageUrl(entry: FileEntry): string | null {
		const item = findMediaItem(entry.name);
		if (item && item.type.startsWith('image/')) return getThumbnailUrl(item);
		if (entry.url && isImageEntry(entry)) {
			if (entry.url.startsWith('http')) return entry.url;
			return entry.url.startsWith('/') ? `${auth.serverUrl}${entry.url}` : `${auth.serverUrl}/${entry.url}`;
		}
		return null;
	}

	function addFiles(fileList: File[]) {
		if (!uppy) return;

		// Enforce the blueprint `limit` (max number of files) for multiple
		// fields. Single fields replace their one entry, so no cap is needed.
		let files = fileList;
		if (field.multiple && typeof field.limit === 'number' && field.limit > 0) {
			const remaining = field.limit - fileEntries.length;
			if (remaining <= 0) {
				toast.error(
					i18n.t('ADMIN_NEXT.FIELDS.FILE.LIMIT_REACHED', { limit: field.limit })
				);
				return;
			}
			if (files.length > remaining) {
				files = files.slice(0, remaining);
				toast.error(
					i18n.t('ADMIN_NEXT.FIELDS.FILE.LIMIT_REACHED', { limit: field.limit })
				);
			}
		}

		for (const file of files) {
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

	// Auto-remove entries whose files no longer exist in media.
	//
	// This only makes sense for object-local media — a `destination` field
	// (e.g. media://) stores its files outside the object's media collection,
	// so reconciling against that collection would wrongly wipe every value on
	// reopen (the reported "media:// images vanish"). Freshly uploaded files are
	// also protected until the media list refreshes (uploadedNames).
	$effect(() => {
		if (useBlueprintUpload) return;
		const items = mediaCtx?.items;
		if (!items || items.length === 0 || fileEntries.length === 0) return;
		const mediaNames = new Set(items.map((m) => m.filename));
		const surviving = fileEntries.filter(
			(e) => mediaNames.has(e.entry.name) || uploadedNames.has(e.entry.name),
		);
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
				<p class="mt-0.5 text-xs text-muted-foreground">{@html sanitizeHtml(translateLabel(field.help))}</p>
			{/if}
		</div>
	{/if}

	<!-- Current files -->
	{#if fileEntries.length > 0}
		<div class="space-y-1">
			{#each fileEntries as { key, entry } (key)}
				{@const thumbUrl = getEntryImageUrl(entry)}
				<div class="flex items-center gap-2.5 rounded-md border border-border bg-muted/30 px-2 py-1.5">
					{#if thumbUrl}
						<img
							src={thumbUrl}
							alt={entry.name}
							class="h-8 w-8 shrink-0 rounded border border-border object-cover"
						/>
					{:else}
						<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted text-[0.625rem] font-semibold text-muted-foreground">
							{entry.name.split('.').pop()?.toUpperCase().slice(0, 4) ?? ''}
						</div>
					{/if}
					<span class="flex-1 truncate text-sm text-foreground">{entry.name}</span>
					{#if !locked}
						<button
							type="button"
							class="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
							onclick={() => removeFile(key)}
						>
							<X size={14} />
						</button>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<!-- Upload zone -->
	{#if (field.multiple || fileEntries.length === 0) && !locked}
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
					<p class="text-[0.625rem] text-muted-foreground/60">
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
