<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import {
		encodeMediaFileUrl,
		getSiteMediaMeta,
		saveSiteMediaMeta,
		mediaMarkdown,
		type MediaItem,
		type MediaMetaResponse,
		type MediaMetaValues,
	} from '$lib/api/endpoints/media';
	import { auth } from '$lib/stores/auth.svelte';
	import { mediaManager } from '$lib/stores/mediaManager.svelte';
	import { toast } from 'svelte-sonner';
	import MediaMetadataForm from './MediaMetadataForm.svelte';
	import MediaFileDetails from './MediaFileDetails.svelte';
	import { X, Trash2, PenLine, ExternalLink } from 'lucide-svelte';
	import DirectionalIcon from '$lib/components/ui/DirectionalIcon.svelte';

	interface Props {
		file: MediaItem;
		ondelete: (file: MediaItem) => void;
		readonly?: boolean;
	}

	let { file, ondelete, readonly = false }: Props = $props();

	// Full path of the file relative to the media root, used to address its
	// `.meta.yaml` sidecar via the metadata endpoints.
	const filePath = $derived(file.path ? `${file.path}/${file.filename}` : file.filename);

	// When more than one file is selected, the metadata form edits apply to the
	// whole selection (changed fields only) rather than just the inspected file.
	const selectionCount = $derived(mediaManager.selectedFiles.size);

	async function handleBatchSave(fields: MediaMetaValues) {
		const res = await mediaManager.batchSaveMeta(fields);
		return { successful: res.successful, failed: res.failed };
	}

	let renaming = $state(false);
	let renameValue = $state('');

	function resolveUrl(url: string): string {
		const safe = encodeMediaFileUrl(url);
		if (safe.startsWith('http')) return safe;
		return safe.startsWith('/') ? `${auth.serverUrl}${safe}` : `${auth.serverUrl}/${safe}`;
	}

	function getMediaStreamPath(): string {
		const fullPath = file.path ? `${file.path}/${file.filename}` : file.filename;
		return `media://${fullPath}`;
	}

	// Alt/title just saved in the inline metadata form, so the markdown snippet
	// reflects the edit without waiting for the listing to reload. Reset when a
	// different file is selected.
	let savedMeta = $state<{ alt: string; title: string } | null>(null);
	$effect(() => {
		void file.filename;
		savedMeta = null;
	});

	function applySavedMeta(meta: MediaMetaResponse) {
		const field = (key: string) => {
			const v = meta.fields.find((f) => f.key === key)?.value;
			return typeof v === 'string' ? v : '';
		};
		savedMeta = { alt: field('alt'), title: field('title') };
	}

	function getMarkdownSnippet(): string {
		const item = savedMeta ? { ...file, ...savedMeta } : file;
		return mediaMarkdown(item, getMediaStreamPath());
	}

	const copyRows = $derived([
		{ label: i18n.t('ADMIN_NEXT.MEDIA.FILE_DETAILS.MEDIA_PATH'), value: getMediaStreamPath() },
		{ label: i18n.t('ADMIN_NEXT.MEDIA.FILE_DETAILS.URL'), value: resolveUrl(file.url) },
		{ label: i18n.t('ADMIN_NEXT.MEDIA.FILE_DETAILS.MARKDOWN'), value: getMarkdownSnippet() },
	]);

	function startRename() {
		renaming = true;
		renameValue = file.filename;
	}

	async function submitRename() {
		if (!renameValue || renameValue === file.filename) {
			renaming = false;
			return;
		}
		try {
			await mediaManager.renameFile(file, renameValue);
			toast.success(i18n.t('ADMIN_NEXT.MEDIA.MEDIA_INSPECTOR.FILE_RENAMED'));
			renaming = false;
		} catch (err) {
			toast.error(`Rename failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
		}
	}

	function handleRenameKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			submitRename();
		} else if (e.key === 'Escape') {
			renaming = false;
		}
	}
</script>

<div class="flex h-full flex-col border-s border-border bg-card">
	<!-- Header -->
	<div class="flex items-center justify-between border-b border-border px-4 py-2">
		<div class="flex items-center gap-1">
			<button
				class="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				onclick={() => mediaManager.navigateInspector('prev')}
				aria-label={i18n.t('ADMIN_NEXT.MEDIA.MEDIA_INSPECTOR.PREVIOUS_FILE')}
			>
				<DirectionalIcon name="chevron-back" size={14} />
			</button>
			<button
				class="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				onclick={() => mediaManager.navigateInspector('next')}
				aria-label={i18n.t('ADMIN_NEXT.MEDIA.MEDIA_INSPECTOR.NEXT_FILE')}
			>
				<DirectionalIcon name="chevron-forward" size={14} />
			</button>
		</div>
		<button
			class="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
			onclick={() => mediaManager.inspectFile(null)}
			aria-label="Close"
		>
			<X size={14} />
		</button>
	</div>

	<!-- Content -->
	<div class="flex-1 overflow-y-auto p-4">
		<MediaFileDetails {file} {copyRows}>
			<!-- Filename -->
			<div class="mt-4">
				{#if renaming}
					<input
						class="w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring"
						bind:value={renameValue}
						onkeydown={handleRenameKeydown}
						onblur={submitRename}
					/>
				{:else}
					<div class="flex items-center gap-2">
						<h3 class="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{file.filename}</h3>
						{#if !readonly}
							<button
								class="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
								onclick={startRename}
								aria-label={i18n.t('ADMIN_NEXT.MEDIA.MEDIA_INSPECTOR.RENAME')}
							>
								<PenLine size={12} />
							</button>
						{/if}
					</div>
				{/if}
			</div>
		</MediaFileDetails>

		<!-- Editable metadata (.meta.yaml sidecar) -->
		<div class="mt-5 border-t border-border pt-4">
			<h4 class="mb-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
				{i18n.t('ADMIN_NEXT.MEDIA.METADATA.TITLE')}
			</h4>
			{#if selectionCount > 1 && !readonly}
				<div class="mb-3 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-[0.6875rem] leading-snug text-primary">
					{i18n.t('ADMIN_NEXT.MEDIA.METADATA.BATCH_EDITING', { n: selectionCount })}
				</div>
			{/if}
			<MediaMetadataForm
				filename={filePath}
				load={() => getSiteMediaMeta(filePath)}
				save={(values) => saveSiteMediaMeta(filePath, values)}
				onsaved={applySavedMeta}
				batchCount={selectionCount}
				saveBatch={handleBatchSave}
				{readonly}
			/>
		</div>

		<!-- Actions -->
		<div class="mt-5 flex items-center gap-2 border-t border-border pt-4">
			<a
				href={resolveUrl(file.url)}
				target="_blank"
				rel="noopener"
				class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[0.75rem] font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
			>
				<ExternalLink size={13} />
				{i18n.t('ADMIN_NEXT.MEDIA.FILE_DETAILS.OPEN')}
			</a>
			<div class="flex-1"></div>
			{#if !readonly}
				<button
					class="inline-flex h-8 items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 text-[0.75rem] font-medium text-destructive transition-colors hover:bg-destructive/20"
					onclick={() => ondelete(file)}
				>
					<Trash2 size={13} />
					{i18n.t('ADMIN_NEXT.DELETE')}
				</button>
			{/if}
		</div>
	</div>
</div>
