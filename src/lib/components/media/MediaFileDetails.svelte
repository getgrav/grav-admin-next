<script lang="ts">
	import type { Snippet } from 'svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import { encodeMediaFileUrl, type MediaItem } from '$lib/api/endpoints/media';
	import { toast } from 'svelte-sonner';
	import {
		Copy, ExternalLink,
		FileVideo2, FileAudio, FileText, FileArchive, FileSpreadsheet,
		FileCode, File
	} from 'lucide-svelte';

	interface CopyRow {
		/** Human label used in the "copied" toast. */
		label: string;
		value: string;
	}

	interface Props {
		file: MediaItem;
		/**
		 * Text for the Path row. Defaults to the item's own folder (site media);
		 * page media has no folder of its own, so the host passes the page route.
		 */
		path?: string;
		/** Copyable one-line values (stream path, URL, markdown snippet, …). */
		copyRows?: CopyRow[];
		/** When set, an "Open" link to the file is rendered under the copy rows. */
		openUrl?: string;
		/** Rendered between the preview and the facts — e.g. an inline rename field. */
		children?: Snippet;
	}

	let { file, path, copyRows = [], openUrl, children }: Props = $props();

	const resolvedPath = $derived(path ?? (file.path ? `${file.path}/` : undefined));

	function resolveUrl(url: string): string {
		const safe = encodeMediaFileUrl(url);
		if (safe.startsWith('http')) return safe;
		return safe.startsWith('/') ? `${auth.serverUrl}${safe}` : `${auth.serverUrl}/${safe}`;
	}

	function resolveApiUrl(url: string): string {
		if (url.startsWith('http')) return url;
		return `${auth.serverUrl}${url}`;
	}

	function getThumbnailUrl(): string {
		if (file.thumbnail_url) return resolveApiUrl(file.thumbnail_url);
		return resolveUrl(file.url);
	}

	function isImage(): boolean {
		return file.type.startsWith('image/');
	}

	function getFileIcon(mime: string) {
		if (mime.startsWith('video/')) return { icon: FileVideo2, bg: 'bg-purple-500/10 text-purple-500' };
		if (mime.startsWith('audio/')) return { icon: FileAudio, bg: 'bg-emerald-500/10 text-emerald-500' };
		if (mime === 'application/pdf') return { icon: FileText, bg: 'bg-red-500/10 text-red-500' };
		if (mime.includes('zip') || mime.includes('compressed') || mime.includes('tar')) return { icon: FileArchive, bg: 'bg-amber-500/10 text-amber-500' };
		if (mime.includes('spreadsheet') || mime.includes('excel')) return { icon: FileSpreadsheet, bg: 'bg-green-500/10 text-green-500' };
		if (mime === 'image/svg+xml') return { icon: FileCode, bg: 'bg-blue-500/10 text-blue-500' };
		return { icon: File, bg: 'bg-muted text-muted-foreground' };
	}

	function formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleString();
	}

	async function copyToClipboard(text: string, label: string) {
		try {
			await navigator.clipboard.writeText(text);
			toast.success(i18n.t('ADMIN_NEXT.TOASTS.COPIED', { label }));
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.MEDIA.MEDIA_INSPECTOR.FAILED_TO_COPY'));
		}
	}
</script>

<!-- Preview -->
<div class="overflow-hidden rounded-lg border border-border bg-muted/30">
	{#if isImage()}
		<img
			src={getThumbnailUrl()}
			alt={file.filename}
			class="w-full object-contain"
			style="max-height: 240px;"
		/>
	{:else}
		{@const info = getFileIcon(file.type)}
		<div class="flex h-40 flex-col items-center justify-center gap-2 {info.bg}">
			<info.icon size={36} />
			<span class="text-xs font-medium">{file.filename.split('.').pop()?.toUpperCase()}</span>
		</div>
	{/if}
</div>

{@render children?.()}

<!-- Facts -->
<div class="mt-4 space-y-3">
	{#if resolvedPath}
		<div>
			<dt class="text-[0.6875rem] font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.MEDIA.FILE_DETAILS.PATH')}</dt>
			<dd class="mt-0.5 break-all text-sm text-foreground">{resolvedPath}</dd>
		</div>
	{/if}
	<div>
		<dt class="text-[0.6875rem] font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.MEDIA.FILE_DETAILS.TYPE')}</dt>
		<dd class="mt-0.5 text-sm text-foreground">{file.type}</dd>
	</div>
	<div>
		<dt class="text-[0.6875rem] font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.MEDIA.FILE_DETAILS.SIZE')}</dt>
		<dd class="mt-0.5 text-sm text-foreground">{formatSize(file.size)}</dd>
	</div>
	{#if file.dimensions}
		<div>
			<dt class="text-[0.6875rem] font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.MEDIA.MEDIA_INSPECTOR.DIMENSIONS')}</dt>
			<dd class="mt-0.5 text-sm text-foreground">{file.dimensions.width} &times; {file.dimensions.height}</dd>
		</div>
	{/if}
	<div>
		<dt class="text-[0.6875rem] font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.PAGES.HEADER_MODIFIED')}</dt>
		<dd class="mt-0.5 text-sm text-foreground">{formatDate(file.modified)}</dd>
	</div>
</div>

<!-- Copy actions -->
{#if copyRows.length > 0 || openUrl}
	<div class="mt-5 space-y-2">
		{#each copyRows as row (row.label)}
			<button
				type="button"
				class="flex w-full items-center gap-2 rounded-md border border-border px-3 py-2 text-start text-[0.75rem] transition-colors hover:bg-accent/50"
				title={row.value}
				onclick={() => copyToClipboard(row.value, row.label)}
			>
				<Copy size={13} class="shrink-0 text-muted-foreground" />
				<span class="min-w-0 flex-1 truncate font-mono text-muted-foreground">{row.value}</span>
			</button>
		{/each}
		{#if openUrl}
			<a
				href={openUrl}
				target="_blank"
				rel="noopener"
				class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[0.75rem] font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
			>
				<ExternalLink size={13} />
				{i18n.t('ADMIN_NEXT.MEDIA.FILE_DETAILS.OPEN')}
			</a>
		{/if}
	</div>
{/if}
