<script lang="ts">
	import type { MediaItem, FolderInfo } from '$lib/api/endpoints/media';
	import { auth } from '$lib/stores/auth.svelte';
	import { mediaManager } from '$lib/stores/mediaManager.svelte';
	import {
		Folder, FileVideo2, FileAudio, FileText, FileArchive,
		FileSpreadsheet, FileCode, File, Check
	} from 'lucide-svelte';

	interface FileProps {
		kind: 'file';
		item: MediaItem;
		index: number;
	}

	interface FolderProps {
		kind: 'folder';
		folder: FolderInfo;
	}

	type Props = FileProps | FolderProps;

	let props: Props = $props();

	function resolveUrl(url: string): string {
		if (url.startsWith('http')) return url;
		return url.startsWith('/') ? `${auth.serverUrl}${url}` : `${auth.serverUrl}/${url}`;
	}

	function resolveApiUrl(url: string): string {
		if (url.startsWith('http')) return url;
		return `${auth.serverUrl}${url}`;
	}

	function getThumbnailUrl(item: MediaItem): string {
		if (item.thumbnail_url) return resolveApiUrl(item.thumbnail_url);
		return resolveUrl(item.url);
	}

	function isImage(item: MediaItem): boolean {
		return item.type.startsWith('image/');
	}

	function getFileIcon(mime: string) {
		if (mime.startsWith('video/')) return { icon: FileVideo2, bg: 'bg-purple-500/10 text-purple-500 dark:text-purple-400' };
		if (mime.startsWith('audio/')) return { icon: FileAudio, bg: 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400' };
		if (mime === 'application/pdf') return { icon: FileText, bg: 'bg-red-500/10 text-red-500 dark:text-red-400' };
		if (mime.includes('zip') || mime.includes('compressed') || mime.includes('tar') || mime.includes('gzip')) return { icon: FileArchive, bg: 'bg-amber-500/10 text-amber-500 dark:text-amber-400' };
		if (mime.includes('spreadsheet') || mime.includes('excel')) return { icon: FileSpreadsheet, bg: 'bg-green-500/10 text-green-500 dark:text-green-400' };
		if (mime === 'image/svg+xml') return { icon: FileCode, bg: 'bg-blue-500/10 text-blue-500 dark:text-blue-400' };
		return { icon: File, bg: 'bg-muted text-muted-foreground' };
	}

	function getExtension(filename: string): string {
		const parts = filename.split('.');
		return parts.length > 1 ? parts.pop()!.toUpperCase() : '';
	}

	function formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	function handleClick(e: MouseEvent) {
		if (props.kind === 'folder') {
			mediaManager.navigateTo(props.folder.path);
			return;
		}
		if (e.metaKey || e.ctrlKey) {
			mediaManager.toggleSelect(props.item, props.index);
		} else if (e.shiftKey) {
			mediaManager.selectRange(props.index);
		} else {
			mediaManager.select(props.item, props.index);
		}
	}

	const selected = $derived(
		props.kind === 'file' && mediaManager.isSelected(props.item),
	);
</script>

{#if props.kind === 'folder'}
	<!-- Folder card -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-border bg-card p-4 transition-all hover:border-primary/30 hover:bg-accent/50 hover:shadow-sm"
		onclick={handleClick}
	>
		<Folder size={32} class="text-primary/70" />
		<div class="w-full text-center">
			<div class="truncate text-[13px] font-medium text-foreground">{props.folder.name}</div>
			<div class="text-[11px] text-muted-foreground">
				{props.folder.file_count} file{props.folder.file_count !== 1 ? 's' : ''}
				{#if props.folder.children_count > 0}
					, {props.folder.children_count} folder{props.folder.children_count !== 1 ? 's' : ''}
				{/if}
			</div>
		</div>
	</div>
{:else}
	<!-- File card -->
	{@const fileInfo = getFileIcon(props.item.type)}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="group relative flex cursor-pointer flex-col overflow-hidden rounded-lg border transition-all
			{selected
				? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
				: 'border-border bg-card hover:border-border hover:shadow-sm'}"
		onclick={handleClick}
	>
		<!-- Thumbnail area -->
		<div class="relative aspect-square overflow-hidden bg-muted/50">
			{#if isImage(props.item)}
				<img
					src={getThumbnailUrl(props.item)}
					alt={props.item.filename}
					class="h-full w-full object-cover"
					loading="lazy"
				/>
			{:else}
				<div class="flex h-full w-full flex-col items-center justify-center gap-2 {fileInfo.bg}">
					<fileInfo.icon size={28} />
					<span class="rounded bg-background/80 px-2 py-0.5 text-[10px] font-semibold tracking-wide">
						{getExtension(props.item.filename)}
					</span>
				</div>
			{/if}

			<!-- Selection checkbox -->
			<div class="absolute left-1.5 top-1.5 {selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity">
				<div class="flex h-5 w-5 items-center justify-center rounded border shadow-sm transition-colors
					{selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background/90'}">
					{#if selected}
						<Check size={12} strokeWidth={3} />
					{/if}
				</div>
			</div>
		</div>

		<!-- File info -->
		<div class="flex flex-col gap-0.5 px-2.5 py-2">
			<div class="truncate text-[12px] font-medium text-foreground">{props.item.filename}</div>
			<div class="text-[11px] text-muted-foreground">{formatSize(props.item.size)}</div>
		</div>
	</div>
{/if}
