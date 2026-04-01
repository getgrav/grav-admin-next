<script lang="ts">
	import type { MediaItem, FolderInfo } from '$lib/api/endpoints/media';
	import { auth } from '$lib/stores/auth.svelte';
	import { mediaManager } from '$lib/stores/mediaManager.svelte';
	import {
		Folder, FileVideo2, FileAudio, FileText, FileArchive,
		FileSpreadsheet, FileCode, File, Check, ChevronRight
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

	function resolveApiUrl(url: string): string {
		if (url.startsWith('http')) return url;
		return `${auth.serverUrl}${url}`;
	}

	function getThumbnailUrl(item: MediaItem): string {
		if (item.thumbnail_url) return resolveApiUrl(item.thumbnail_url);
		if (item.type.startsWith('image/')) {
			const url = item.url;
			return url.startsWith('http') ? url : `${auth.serverUrl}${url.startsWith('/') ? '' : '/'}${url}`;
		}
		return '';
	}

	function getFileIcon(mime: string) {
		if (mime.startsWith('video/')) return { icon: FileVideo2, color: 'text-purple-500 dark:text-purple-400' };
		if (mime.startsWith('audio/')) return { icon: FileAudio, color: 'text-emerald-500 dark:text-emerald-400' };
		if (mime === 'application/pdf') return { icon: FileText, color: 'text-red-500 dark:text-red-400' };
		if (mime.includes('zip') || mime.includes('compressed') || mime.includes('tar')) return { icon: FileArchive, color: 'text-amber-500 dark:text-amber-400' };
		if (mime.includes('spreadsheet') || mime.includes('excel')) return { icon: FileSpreadsheet, color: 'text-green-500 dark:text-green-400' };
		if (mime === 'image/svg+xml') return { icon: FileCode, color: 'text-blue-500 dark:text-blue-400' };
		return { icon: File, color: 'text-muted-foreground' };
	}

	function formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	function formatDate(iso: string): string {
		const d = new Date(iso);
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function getMimeLabel(mime: string): string {
		const parts = mime.split('/');
		return parts[1]?.toUpperCase() ?? mime;
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
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="group flex cursor-pointer items-center gap-3 border-b border-border/50 px-4 py-2 transition-colors hover:bg-accent/50"
		onclick={handleClick}
	>
		<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
			<Folder size={18} class="text-primary/70" />
		</div>
		<div class="min-w-0 flex-1">
			<div class="text-sm font-medium text-foreground">{props.folder.name}</div>
			<div class="text-[11px] text-muted-foreground">
				{props.folder.file_count} file{props.folder.file_count !== 1 ? 's' : ''}
			</div>
		</div>
		<ChevronRight size={14} class="text-muted-foreground/40" />
	</div>
{:else}
	{@const fileInfo = getFileIcon(props.item.type)}
	{@const thumbUrl = getThumbnailUrl(props.item)}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="group flex cursor-pointer items-center gap-3 border-b border-border/50 px-4 py-2 transition-colors
			{selected ? 'bg-primary/5' : 'hover:bg-accent/50'}"
		onclick={handleClick}
	>
		<!-- Checkbox -->
		<div class="flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors
			{selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}
			{selected ? '' : 'opacity-0 group-hover:opacity-100'}">
			{#if selected}
				<Check size={12} strokeWidth={3} />
			{/if}
		</div>

		<!-- Thumbnail -->
		<div class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/50">
			{#if thumbUrl && props.item.type.startsWith('image/')}
				<img src={thumbUrl} alt="" class="h-full w-full object-cover" loading="lazy" />
			{:else}
				<fileInfo.icon size={16} class={fileInfo.color} />
			{/if}
		</div>

		<!-- Filename -->
		<div class="min-w-0 flex-1">
			<div class="truncate text-sm font-medium text-foreground">{props.item.filename}</div>
			{#if props.item.path}
				<div class="truncate text-[11px] text-muted-foreground">{props.item.path}</div>
			{/if}
		</div>

		<!-- Type -->
		<div class="hidden w-20 text-right text-[11px] text-muted-foreground sm:block">
			{getMimeLabel(props.item.type)}
		</div>

		<!-- Size -->
		<div class="w-16 text-right text-[11px] text-muted-foreground">
			{formatSize(props.item.size)}
		</div>

		<!-- Date -->
		<div class="hidden w-24 text-right text-[11px] text-muted-foreground md:block">
			{formatDate(props.item.modified)}
		</div>
	</div>
{/if}
