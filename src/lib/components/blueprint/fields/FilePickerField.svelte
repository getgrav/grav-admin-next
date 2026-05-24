<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import type { MediaItem } from '$lib/api/endpoints/media';
	import type { PageMediaContext } from '$lib/components/media/types';
	import { getContext } from 'svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import { ChevronDown, X } from 'lucide-svelte';
	import {
		getBlueprintFiles,
		BLUEPRINT_FILES_PAGE_MEDIA_ONLY,
	} from '$lib/api/endpoints/media';

	interface Props {
		field: BlueprintField;
		value: unknown;
		onchange: (value: unknown) => void;
	}

	let { field, value, onchange }: Props = $props();
	const translateLabel = i18n.tMaybe;
	const mediaCtx = getContext<PageMediaContext | undefined>('pageMediaItems');
	// Owning scope for `self@:` resolution; set by the page-edit route as
	// `pages/<route>`. Plugins/themes/users editors set their own values.
	const getBlueprintScope = getContext<(() => string) | undefined>('blueprintScope');

	let open = $state(false);
	let search = $state('');
	let highlightedIndex = $state(-1);
	let inputEl = $state<HTMLInputElement | null>(null);

	const currentValue = $derived(
		typeof value === 'string' ? value : ''
	);

	// Page-media mode (default + `self@` literals) reads from the
	// pageMediaItems context, fed by /pages/{route}/media. Stream mode
	// (any other `field.folder` value — `user://media`, `theme://images`,
	// `@self/sub`, `self@:videos`, a plain relative path, …) fetches from
	// /blueprint-files. This mirrors admin-classic's
	// `taskGetFilesInFolder` branch on `folder`.
	const usesPageMedia = $derived(
		!field.folder || field.folder === 'self@' || field.folder === '@self' ||
			field.folder === '@self/' || field.folder === '@self@'
	);

	let streamItems = $state<MediaItem[] | null>(null);
	let streamLoading = $state(false);
	let streamError = $state<string | null>(null);

	$effect(() => {
		if (usesPageMedia) {
			streamItems = null;
			streamLoading = false;
			streamError = null;
			return;
		}
		const folder = field.folder!;
		const scope = getBlueprintScope?.() ?? '';
		const accept = field.accept;
		let cancelled = false;
		streamLoading = true;
		streamError = null;
		getBlueprintFiles({
			folder,
			scope,
			accept,
			preview_images: true,
		}).then((result) => {
			if (cancelled) return;
			if (result === BLUEPRINT_FILES_PAGE_MEDIA_ONLY) {
				streamItems = null;
			} else {
				streamItems = result.items;
			}
			streamLoading = false;
		}).catch((err) => {
			if (cancelled) return;
			streamItems = [];
			streamError = err instanceof Error ? err.message : String(err);
			streamLoading = false;
		});
		return () => { cancelled = true; };
	});

	// Filter media items by field's accept patterns (e.g. ['image/*', '.pdf', '.zip'])
	function matchesAccept(item: MediaItem): boolean {
		if (!field.accept || field.accept.length === 0) return true;
		const filename = item.filename.toLowerCase();
		const mime = item.type.toLowerCase();
		return field.accept.some((pattern) => {
			const p = pattern.toLowerCase().trim();
			if (p.includes('*')) {
				const prefix = p.replace('*', '');
				return mime.startsWith(prefix);
			}
			if (p.startsWith('.')) {
				return filename.endsWith(p);
			}
			return mime === p;
		});
	}

	// The source list: page-media context when in page-media mode (or stream
	// mode is still loading / fell back to page media). Otherwise the
	// /blueprint-files response.
	const sourceItems = $derived.by<MediaItem[]>(() => {
		if (usesPageMedia) return mediaCtx?.items ?? [];
		return streamItems ?? [];
	});

	const filteredMedia = $derived.by(() => {
		// Server already applied `accept` in stream mode; in page-media mode
		// the context isn't filtered, so we apply it client-side here.
		const items = usesPageMedia ? sourceItems.filter(matchesAccept) : sourceItems;
		if (!search) return items;
		const q = search.toLowerCase();
		return items.filter((item) => item.filename.toLowerCase().includes(q));
	});

	function isImage(item: MediaItem): boolean {
		return item.type.startsWith('image/');
	}

	function resolveUrl(url: string): string {
		if (url.startsWith('http')) return url;
		return url.startsWith('/') ? url : `${auth.serverUrl}/${url}`;
	}

	function getThumbnailUrl(item: MediaItem): string {
		if (item.thumbnail_url) {
			const url = item.thumbnail_url;
			return url.startsWith('http') ? url : `${auth.serverUrl}${url}`;
		}
		return resolveUrl(item.url);
	}

	function selectItem(filename: string) {
		onchange(filename);
		open = false;
		search = '';
		highlightedIndex = -1;
	}

	function clearValue() {
		onchange('');
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			open = false;
			highlightedIndex = -1;
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			highlightedIndex = Math.min(highlightedIndex + 1, filteredMedia.length - 1);
			open = true;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			highlightedIndex = Math.max(highlightedIndex - 1, -1);
		} else if (e.key === 'Enter' && highlightedIndex >= 0) {
			e.preventDefault();
			selectItem(filteredMedia[highlightedIndex].filename);
		}
	}

	function handleFocus() {
		open = true;
		highlightedIndex = -1;
	}

	function handleBlur() {
		setTimeout(() => {
			open = false;
			search = '';
			highlightedIndex = -1;
		}, 200);
	}

	// Find the selected media item for thumbnail preview
	const selectedItem = $derived.by(() => {
		if (!currentValue) return null;
		return sourceItems.find((m) => m.filename === currentValue) ?? null;
	});

	// Auto-clear value when the selected file is gone — applies only in
	// page-media mode (the page's own media list is authoritative). In
	// stream mode we trust the value: the file might be uploaded later
	// to that destination, or live elsewhere on the filesystem that the
	// browse endpoint can't see (filtered by `accept`, etc.).
	$effect(() => {
		if (!usesPageMedia) return;
		const items = mediaCtx?.items;
		if (!items || items.length === 0 || !currentValue) return;
		const exists = items.some((m) => m.filename === currentValue);
		if (!exists) {
			onchange('');
		}
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
				<p class="mt-0.5 text-xs text-muted-foreground">{@html translateLabel(field.help)}</p>
			{/if}
		</div>
	{/if}

	<div class="relative">
		<!-- Selected value display / search input -->
		<div class="flex min-h-[40px] items-center rounded-lg border border-input bg-muted/50 shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring">
			{#if currentValue && !open}
				<!-- Show selected file with thumbnail -->
				<div class="flex flex-1 items-center gap-2.5 px-2">
					{#if selectedItem && isImage(selectedItem)}
						<img
							src={getThumbnailUrl(selectedItem)}
							alt={selectedItem.filename}
							class="h-8 w-8 shrink-0 rounded border border-border object-cover"
						/>
					{:else}
						<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted text-[0.625rem] font-semibold text-muted-foreground">
							{currentValue.split('.').pop()?.toUpperCase().slice(0, 4) ?? ''}
						</div>
					{/if}
					<span class="truncate text-sm text-foreground">{currentValue}</span>
				</div>
				<button
					type="button"
					class="shrink-0 px-2 text-muted-foreground transition-colors hover:text-foreground"
					onclick={clearValue}
					title="Clear"
				>
					<X size={14} />
				</button>
			{:else}
				<!-- Search input -->
				<input
					bind:this={inputEl}
					type="text"
					class="h-10 flex-1 rounded-lg border-0 bg-transparent px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
					placeholder={currentValue || translateLabel(field.placeholder) || 'Select a file...'}
					value={search}
					oninput={(e) => { search = (e.target as HTMLInputElement).value; }}
					onkeydown={handleKeydown}
					onfocus={handleFocus}
					onblur={handleBlur}
				/>
			{/if}
			<button
				type="button"
				class="shrink-0 px-2 text-muted-foreground"
				onclick={() => { open = !open; if (open) inputEl?.focus(); }}
				tabindex={-1}
			>
				<ChevronDown size={14} />
			</button>
		</div>

		<!-- Dropdown -->
		{#if open}
			<div class="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
				{#if streamLoading}
					<div class="px-3 py-4 text-center text-sm text-muted-foreground">
						{i18n.t('ADMIN_NEXT.COMMON.LOADING') || 'Loading…'}
					</div>
				{:else if streamError}
					<div class="px-3 py-4 text-center text-sm text-destructive">
						{streamError}
					</div>
				{:else if filteredMedia.length === 0}
					<div class="px-3 py-4 text-center text-sm text-muted-foreground">
						{#if usesPageMedia && (mediaCtx?.items ?? []).length === 0}
							{i18n.t('ADMIN_NEXT.FIELDS.FILE_PICKER.NO_MEDIA_UPLOADED')}
						{:else if !usesPageMedia && sourceItems.length === 0}
							{i18n.t('ADMIN_NEXT.FIELDS.FILE_PICKER.NO_MEDIA_UPLOADED')}
						{:else}
							{i18n.t('ADMIN_NEXT.FIELDS.FILE_PICKER.NO_MATCHING_FILES')}
						{/if}
					</div>
				{:else}
					<div class="max-h-60 overflow-y-auto p-1">
						{#each filteredMedia as item, i (item.filename)}
							<button
								type="button"
								class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-start transition-colors
									{item.filename === currentValue
										? 'bg-primary/10 text-primary'
										: i === highlightedIndex
											? 'bg-accent text-accent-foreground'
											: 'text-foreground hover:bg-accent'}"
								onmousedown={(e) => { e.preventDefault(); selectItem(item.filename); }}
							>
								{#if isImage(item)}
									<img
										src={getThumbnailUrl(item)}
										alt={item.filename}
										class="h-8 w-8 shrink-0 rounded object-cover"
									/>
								{:else}
									<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted text-[0.625rem] font-medium text-muted-foreground">
										{item.filename.split('.').pop()?.toUpperCase().slice(0, 4)}
									</div>
								{/if}
								<span class="truncate text-sm">{item.filename}</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>
