<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import type { MediaSelection, MediaSourceKind, PageMediaContext } from '$lib/components/media/types';
	import { getSiteMedia, encodeMediaFileUrl, type MediaItem } from '$lib/api/endpoints/media';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import { portal } from '$lib/utils/portal';
	import MediaSourceTabs from '$lib/components/media/MediaSourceTabs.svelte';
	import { getContext } from 'svelte';
	import { X, ImagePlus, ChevronLeft, ChevronRight, Link as LinkIcon } from 'lucide-svelte';

	interface Props {
		field: BlueprintField;
		value: unknown;
		onchange: (value: unknown) => void;
	}

	let { field, value, onchange }: Props = $props();

	const mediaCtx = getContext<PageMediaContext | undefined>('pageMediaItems');

	const ALL_SOURCES: MediaSourceKind[] = ['page', 'site', 'url'];

	/**
	 * `sources` picks which tabs the field offers, in blueprint order. Unknown
	 * entries are dropped rather than rendered as a dead tab; an empty or absent
	 * list means all three.
	 */
	const sources = $derived.by<MediaSourceKind[]>(() => {
		const raw = field.sources;
		if (!Array.isArray(raw) || raw.length === 0) return ALL_SOURCES;
		const picked = raw.filter((s): s is MediaSourceKind =>
			ALL_SOURCES.includes(s as MediaSourceKind),
		);
		return picked.length ? picked : ALL_SOURCES;
	});

	const multiple = $derived(field.multiple === true);
	// An absent `accept` means "any media file", matching filepicker. Passing an
	// explicit empty list matters: the picker's own default is images-only.
	const accept = $derived(field.accept ?? []);

	/**
	 * The Site tab browses `user://media`, so `folder` is normalized to a path
	 * relative to that root. `media://logos`, `user://media/logos` and a bare
	 * `logos` all mean the same folder. Other streams (`theme://images`, …) are
	 * out of scope for this field — `filepicker` still covers those.
	 */
	const siteRoot = $derived.by(() => {
		const raw = (field.folder ?? '').trim();
		if (!raw) return '';
		return raw
			.replace(/^media:\/\//, '')
			.replace(/^user:\/\/media\/?/, '')
			.replace(/^\/+|\/+$/g, '');
	});

	// Stored values, always as an array internally. Tolerates a legacy
	// comma-joined string so a field switched over from `filepicker` still reads.
	const values = $derived.by<string[]>(() => {
		if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string' && v !== '');
		if (typeof value === 'string' && value !== '') {
			return multiple ? value.split(',').map((s) => s.trim()).filter(Boolean) : [value];
		}
		return [];
	});

	// ── Preview resolution ────────────────────────────────────────────────
	// A stored value is just a string, so previews have to be resolved back to a
	// servable URL. Page media comes from the shared context; `media://` paths
	// are looked up one folder at a time via GET /media (cached per folder for
	// the life of the page); URLs are already absolute.

	let siteUrlCache = $state<Record<string, string>>({});
	const requestedFolders = new Set<string>();

	function absolute(raw: string): string {
		if (raw.startsWith('http')) return raw;
		return raw.startsWith('/') ? `${auth.serverUrl}${raw}` : `${auth.serverUrl}/${raw}`;
	}

	function isUrlValue(v: string): boolean {
		return /^(https?:)?\/\//.test(v) || v.startsWith('data:');
	}

	function isStreamValue(v: string): boolean {
		return v.startsWith('media://');
	}

	function pageItemFor(v: string): MediaItem | undefined {
		return mediaCtx?.items?.find((m) => m.filename === v);
	}

	// Lazily fetch each folder referenced by a `media://` value.
	$effect(() => {
		for (const v of values) {
			if (!isStreamValue(v)) continue;
			const rel = v.slice('media://'.length);
			const folder = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
			if (requestedFolders.has(folder)) continue;
			requestedFolders.add(folder);

			void getSiteMedia({ path: folder, per_page: 500 })
				.then((res) => {
					const next: Record<string, string> = {};
					for (const item of res.items) {
						const key = `media://${item.path ? `${item.path}/${item.filename}` : item.filename}`;
						next[key] = absolute(encodeMediaFileUrl(item.thumbnail_url ?? item.url));
					}
					siteUrlCache = { ...siteUrlCache, ...next };
				})
				.catch(() => {
					// A missing or unreadable folder just means no thumbnail — the
					// value itself is still shown, and may point at a file uploaded later.
					requestedFolders.delete(folder);
				});
		}
	});

	/** Servable preview URL for a stored value, or null when it can't be resolved. */
	function previewUrl(v: string): string | null {
		if (isUrlValue(v)) return v;
		if (isStreamValue(v)) return siteUrlCache[v] ?? null;
		const item = pageItemFor(v);
		return item ? absolute(encodeMediaFileUrl(item.thumbnail_url ?? item.url)) : null;
	}

	/** Whether a value should render as an image preview at all. */
	function looksLikeImage(v: string): boolean {
		if (isUrlValue(v)) return true; // can't know; let the <img> decide
		const item = pageItemFor(v);
		if (item) return item.type.startsWith('image/');
		return /\.(avif|gif|jpe?g|png|svg|webp)(\?|$)/i.test(v);
	}

	function shortLabel(v: string): string {
		if (isStreamValue(v)) return v.slice('media://'.length);
		if (isUrlValue(v)) {
			try {
				// No base argument: `new URL(v, base)` throws on an empty or
				// invalid base even when `v` is already absolute, which sent every
				// external URL down the catch and showed the whole address.
				return new URL(v, v.startsWith('//') ? 'https:' + v : undefined).pathname
					.split('/')
					.pop() || v;
			} catch {
				return v;
			}
		}
		return v;
	}

	function extBadge(v: string): string {
		const base = shortLabel(v).split('?')[0];
		return base.split('.').pop()?.toUpperCase().slice(0, 4) ?? '';
	}

	// ── Mutation ──────────────────────────────────────────────────────────

	let pickerOpen = $state(false);

	// Previews that failed to load (a dead external URL, a file removed behind
	// our back). Tracked so the tile falls back to an icon instead of rendering
	// a broken image with its alt text overflowing.
	let brokenPreviews = $state<Record<string, true>>({});

	function commit(next: string[]) {
		onchange(multiple ? next : (next[0] ?? ''));
	}

	function handleSelect(sel: MediaSelection) {
		if (multiple) {
			// Ignore a duplicate rather than storing the same file twice.
			if (!values.includes(sel.value)) commit([...values, sel.value]);
			// Stay open so several files can be picked in a row.
			return;
		}
		commit([sel.value]);
		pickerOpen = false;
	}

	function removeAt(index: number) {
		commit(values.filter((_, i) => i !== index));
	}

	function move(index: number, delta: number) {
		const target = index + delta;
		if (target < 0 || target >= values.length) return;
		const next = [...values];
		[next[index], next[target]] = [next[target], next[index]];
		commit(next);
	}

	function closePicker() {
		pickerOpen = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') closePicker();
	}
</script>

<svelte:window onkeydown={pickerOpen ? handleKeydown : undefined} />

<div class="space-y-2">
	{#if values.length > 0}
		<div class="flex flex-wrap gap-2">
			{#each values as val, index (val)}
				{@const preview = previewUrl(val)}
				<div class="group relative w-32 overflow-hidden rounded-lg border border-border bg-muted/40">
					<div class="flex aspect-square items-center justify-center overflow-hidden bg-muted/50">
						{#if preview && looksLikeImage(val) && !brokenPreviews[val]}
							<img
								src={preview}
								alt={shortLabel(val)}
								class="h-full w-full object-cover"
								loading="lazy"
								onerror={() => { brokenPreviews = { ...brokenPreviews, [val]: true }; }}
							/>
						{:else if isUrlValue(val)}
							<LinkIcon size={22} class="text-muted-foreground" />
						{:else}
							<span class="text-xs font-semibold text-muted-foreground">{extBadge(val)}</span>
						{/if}
					</div>
					<div class="truncate px-1.5 py-1 text-[0.625rem] text-muted-foreground" title={val}>
						{shortLabel(val)}
					</div>

					<button
						type="button"
						class="absolute end-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-md bg-neutral-900/70 text-white opacity-0 transition-opacity hover:bg-neutral-900 group-hover:opacity-100 focus:opacity-100"
						onclick={() => removeAt(index)}
						aria-label={i18n.t('ADMIN_NEXT.FIELDS.MEDIA.REMOVE')}
						title={i18n.t('ADMIN_NEXT.FIELDS.MEDIA.REMOVE')}
					>
						<X size={13} />
					</button>

					{#if multiple && values.length > 1}
						<div class="absolute bottom-6 start-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
							<button
								type="button"
								class="inline-flex h-5 w-5 items-center justify-center rounded bg-neutral-900/70 text-white hover:bg-neutral-900 disabled:opacity-40"
								disabled={index === 0}
								onclick={() => move(index, -1)}
								aria-label={i18n.t('ADMIN_NEXT.FIELDS.MEDIA.MOVE_EARLIER')}
							>
								<ChevronLeft size={12} />
							</button>
							<button
								type="button"
								class="inline-flex h-5 w-5 items-center justify-center rounded bg-neutral-900/70 text-white hover:bg-neutral-900 disabled:opacity-40"
								disabled={index === values.length - 1}
								onclick={() => move(index, 1)}
								aria-label={i18n.t('ADMIN_NEXT.FIELDS.MEDIA.MOVE_LATER')}
							>
								<ChevronRight size={12} />
							</button>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	{#if multiple || values.length === 0}
		<button
			type="button"
			class="inline-flex h-10 items-center gap-2 rounded-lg border border-dashed border-input bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
			onclick={() => (pickerOpen = true)}
		>
			<ImagePlus size={15} />
			{field.placeholder
				? i18n.tMaybe(field.placeholder)
				: i18n.t(multiple ? 'ADMIN_NEXT.FIELDS.MEDIA.ADD' : 'ADMIN_NEXT.FIELDS.MEDIA.SELECT')}
		</button>
	{:else}
		<button
			type="button"
			class="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
			onclick={() => (pickerOpen = true)}
		>
			{i18n.t('ADMIN_NEXT.FIELDS.MEDIA.CHANGE')}
		</button>
	{/if}
</div>

{#if pickerOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		use:portal
		class="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/75 p-4 backdrop-blur-sm"
		onclick={(e) => { if (e.target === e.currentTarget) closePicker(); }}
	>
		<div class="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-border bg-card shadow-2xl">
			<div class="flex items-center justify-between border-b border-border px-4 py-3">
				<h3 class="text-sm font-semibold text-foreground">
					{i18n.t('ADMIN_NEXT.FIELDS.MEDIA.TITLE')}
				</h3>
				<button
					class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					onclick={closePicker}
					aria-label={i18n.t('ADMIN_NEXT.CANCEL')}
				>
					<X size={14} />
				</button>
			</div>

			<MediaSourceTabs
				{sources}
				items={mediaCtx?.items ?? []}
				{accept}
				root={siteRoot}
				active={pickerOpen}
				onselect={handleSelect}
			/>

			{#if multiple}
				<div class="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
					<span class="text-xs text-muted-foreground">
						{i18n.t('ADMIN_NEXT.FIELDS.MEDIA.SELECTED_COUNT', { count: values.length })}
					</span>
					<button
						type="button"
						class="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
						onclick={closePicker}
					>
						{i18n.t('ADMIN_NEXT.FIELDS.MEDIA.DONE')}
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}
