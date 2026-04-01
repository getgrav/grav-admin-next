<script lang="ts">
	import type { MediaItem } from '$lib/api/endpoints/media';
	import { auth } from '$lib/stores/auth.svelte';
	import { mediaManager } from '$lib/stores/mediaManager.svelte';
	import { toast } from 'svelte-sonner';
	import {
		X, ChevronLeft, ChevronRight, Trash2, Copy, PenLine,
		FileVideo2, FileAudio, FileText, FileArchive, FileSpreadsheet,
		FileCode, File, ExternalLink
	} from 'lucide-svelte';

	interface Props {
		file: MediaItem;
		ondelete: (file: MediaItem) => void;
	}

	let { file, ondelete }: Props = $props();

	let renaming = $state(false);
	let renameValue = $state('');

	function resolveUrl(url: string): string {
		if (url.startsWith('http')) return url;
		return url.startsWith('/') ? `${auth.serverUrl}${url}` : `${auth.serverUrl}/${url}`;
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

	function getMediaStreamPath(): string {
		const fullPath = file.path ? `${file.path}/${file.filename}` : file.filename;
		return `media://${fullPath}`;
	}

	function getMarkdownSnippet(): string {
		const streamPath = getMediaStreamPath();
		if (file.type.startsWith('image/')) {
			return `![${file.filename}](${streamPath})`;
		}
		return `[${file.filename}](${streamPath})`;
	}

	async function copyToClipboard(text: string, label: string) {
		try {
			await navigator.clipboard.writeText(text);
			toast.success(`${label} copied`);
		} catch {
			toast.error('Failed to copy');
		}
	}

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
			toast.success('File renamed');
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

<div class="flex h-full flex-col border-l border-border bg-card">
	<!-- Header -->
	<div class="flex items-center justify-between border-b border-border px-4 py-2">
		<div class="flex items-center gap-1">
			<button
				class="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				onclick={() => mediaManager.navigateInspector('prev')}
				aria-label="Previous file"
			>
				<ChevronLeft size={14} />
			</button>
			<button
				class="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				onclick={() => mediaManager.navigateInspector('next')}
				aria-label="Next file"
			>
				<ChevronRight size={14} />
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
					<button
						class="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						onclick={startRename}
						aria-label="Rename"
					>
						<PenLine size={12} />
					</button>
				</div>
			{/if}
		</div>

		<!-- Metadata grid -->
		<div class="mt-4 space-y-3">
			{#if file.path}
				<div>
					<dt class="text-[11px] font-medium text-muted-foreground">Path</dt>
					<dd class="mt-0.5 text-sm text-foreground">{file.path}/</dd>
				</div>
			{/if}
			<div>
				<dt class="text-[11px] font-medium text-muted-foreground">Type</dt>
				<dd class="mt-0.5 text-sm text-foreground">{file.type}</dd>
			</div>
			<div>
				<dt class="text-[11px] font-medium text-muted-foreground">Size</dt>
				<dd class="mt-0.5 text-sm text-foreground">{formatSize(file.size)}</dd>
			</div>
			{#if file.dimensions}
				<div>
					<dt class="text-[11px] font-medium text-muted-foreground">Dimensions</dt>
					<dd class="mt-0.5 text-sm text-foreground">{file.dimensions.width} &times; {file.dimensions.height}</dd>
				</div>
			{/if}
			<div>
				<dt class="text-[11px] font-medium text-muted-foreground">Modified</dt>
				<dd class="mt-0.5 text-sm text-foreground">{formatDate(file.modified)}</dd>
			</div>
		</div>

		<!-- Copy actions -->
		<div class="mt-5 space-y-2">
			<button
				class="flex w-full items-center gap-2 rounded-md border border-border px-3 py-2 text-left text-[12px] transition-colors hover:bg-accent/50"
				onclick={() => copyToClipboard(getMediaStreamPath(), 'Media path')}
			>
				<Copy size={13} class="shrink-0 text-muted-foreground" />
				<span class="min-w-0 flex-1 truncate font-mono text-muted-foreground">{getMediaStreamPath()}</span>
			</button>
			<button
				class="flex w-full items-center gap-2 rounded-md border border-border px-3 py-2 text-left text-[12px] transition-colors hover:bg-accent/50"
				onclick={() => copyToClipboard(getMarkdownSnippet(), 'Markdown')}
			>
				<Copy size={13} class="shrink-0 text-muted-foreground" />
				<span class="min-w-0 flex-1 truncate font-mono text-muted-foreground">{getMarkdownSnippet()}</span>
			</button>
		</div>

		<!-- Actions -->
		<div class="mt-5 flex items-center gap-2 border-t border-border pt-4">
			<a
				href={resolveUrl(file.url)}
				target="_blank"
				rel="noopener"
				class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
			>
				<ExternalLink size={13} />
				Open
			</a>
			<div class="flex-1"></div>
			<button
				class="inline-flex h-8 items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 text-[12px] font-medium text-destructive transition-colors hover:bg-destructive/20"
				onclick={() => ondelete(file)}
			>
				<Trash2 size={13} />
				Delete
			</button>
		</div>
	</div>
</div>
