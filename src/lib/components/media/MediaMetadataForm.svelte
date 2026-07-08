<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import { X } from 'lucide-svelte';
	import type { MediaMetaResponse, MediaMetaValues } from '$lib/api/endpoints/media';

	interface Props {
		/** Filename shown for context and used as the reload key. */
		filename: string;
		/** Fetch the current metadata for the file. */
		load: () => Promise<MediaMetaResponse>;
		/** Persist the edited field values; resolves to the updated metadata. */
		save: (values: MediaMetaValues) => Promise<MediaMetaResponse>;
		/** When true, fields are shown read-only (no Save/Reset). */
		readonly?: boolean;
		/** Called after a successful save with the fresh metadata. */
		onsaved?: (meta: MediaMetaResponse) => void;
		/**
		 * Number of files the save applies to. When >1 the form switches to batch
		 * mode: Save is labelled "Apply to N files" and only the *changed* fields
		 * are pushed to the whole selection via {@link saveBatch}.
		 */
		batchCount?: number;
		/** Apply only the changed fields to every selected file at once. */
		saveBatch?: (changed: MediaMetaValues) => Promise<{ successful: number; failed: number }>;
	}

	let { filename, load, save, readonly = false, onsaved, batchCount = 1, saveBatch }: Props = $props();

	const isBatch = $derived(batchCount > 1 && !!saveBatch);

	type FieldValue = string | string[];

	let loading = $state(true);
	let saving = $state(false);
	let error = $state<string | null>(null);
	let meta = $state<MediaMetaResponse | null>(null);

	// Current edit buffer and the last-saved baseline, keyed by field key.
	let values = $state<Record<string, FieldValue>>({});
	let baseline = $state<Record<string, FieldValue>>({});
	// In-progress text for each tags field's input (not yet committed to a chip).
	let tagDrafts = $state<Record<string, string>>({});
	let loadedFor = $state('');

	function eqValue(a: FieldValue | undefined, b: FieldValue | undefined): boolean {
		if (Array.isArray(a) || Array.isArray(b)) {
			const aa = Array.isArray(a) ? a : [];
			const bb = Array.isArray(b) ? b : [];
			return aa.length === bb.length && aa.every((v, i) => v === bb[i]);
		}
		return (a ?? '') === (b ?? '');
	}

	const dirty = $derived.by(() => {
		const keys = new Set([...Object.keys(values), ...Object.keys(baseline)]);
		for (const k of keys) {
			if (!eqValue(values[k], baseline[k])) return true;
		}
		return false;
	});

	// Just the fields the user actually edited (vs the loaded baseline). Batch
	// mode sends only these so untouched fields on the other files are kept.
	const changedFields = $derived.by(() => {
		const out: MediaMetaValues = {};
		const keys = new Set([...Object.keys(values), ...Object.keys(baseline)]);
		for (const k of keys) {
			if (!eqValue(values[k], baseline[k])) out[k] = values[k] ?? '';
		}
		return out;
	});

	// A copy of the loaded metadata with the current edits folded into its
	// fields — used to notify the parent after a batch save (which returns only
	// counts, not a fresh MediaMetaResponse) so the markdown snippet updates.
	function metaWithValues(): MediaMetaResponse | null {
		if (!meta) return null;
		return {
			...meta,
			fields: meta.fields.map((f) => ({
				...f,
				value: values[f.key] ?? f.value,
			})),
		};
	}

	const extraEntries = $derived.by(() => {
		const extra = meta?.extra ?? {};
		return Object.entries(extra).map(([key, value]) => ({ key, value: formatExtra(value) }));
	});

	function formatExtra(value: unknown): string {
		if (value === null || value === undefined) return '';
		if (typeof value === 'object') return JSON.stringify(value);
		return String(value);
	}

	function tags(key: string): string[] {
		const v = values[key];
		return Array.isArray(v) ? v : [];
	}

	function addTag(key: string, raw: string) {
		const t = raw.trim();
		tagDrafts[key] = '';
		if (!t) return;
		const arr = tags(key);
		if (!arr.some((x) => x.toLowerCase() === t.toLowerCase())) {
			values[key] = [...arr, t];
		}
	}

	function removeTag(key: string, index: number) {
		values[key] = tags(key).filter((_, i) => i !== index);
	}

	function handleTagKeydown(e: KeyboardEvent, key: string) {
		if (e.key === 'Enter' || e.key === ',') {
			e.preventDefault();
			addTag(key, tagDrafts[key] ?? '');
		} else if (e.key === 'Backspace' && !(tagDrafts[key] ?? '')) {
			const arr = tags(key);
			if (arr.length) values[key] = arr.slice(0, -1);
		}
	}

	function applyMeta(res: MediaMetaResponse) {
		meta = res;
		const next: Record<string, FieldValue> = {};
		const drafts: Record<string, string> = {};
		for (const field of res.fields) {
			next[field.key] = Array.isArray(field.value) ? [...field.value] : (field.value ?? '');
			if (field.type === 'tags') drafts[field.key] = '';
		}
		values = { ...next };
		baseline = structuredClone(next);
		tagDrafts = drafts;
	}

	async function doLoad() {
		loading = true;
		error = null;
		try {
			applyMeta(await load());
		} catch (err) {
			error = err instanceof Error ? err.message : i18n.t('ADMIN_NEXT.MEDIA.METADATA.LOAD_FAILED');
		} finally {
			loading = false;
		}
	}

	async function doSave() {
		if (saving || readonly) return;
		// Fold any uncommitted tag drafts into their lists before sending.
		for (const [key, draft] of Object.entries(tagDrafts)) {
			if (draft.trim()) addTag(key, draft);
		}
		saving = true;
		try {
			if (isBatch && saveBatch) {
				const res = await saveBatch({ ...changedFields });
				// The inspected file received the same write as the rest of the
				// selection, so the current edit buffer is now the saved state.
				baseline = structuredClone(values);
				if (res.failed > 0) {
					toast.error(
						i18n.t('ADMIN_NEXT.MEDIA.METADATA.BATCH_PARTIAL', {
							saved: res.successful,
							failed: res.failed,
						}),
					);
				} else {
					toast.success(i18n.t('ADMIN_NEXT.MEDIA.METADATA.BATCH_SAVED', { n: res.successful }));
				}
				const updated = metaWithValues();
				if (updated) onsaved?.(updated);
			} else {
				applyMeta(await save({ ...values }));
				toast.success(i18n.t('ADMIN_NEXT.MEDIA.METADATA.SAVED'));
				if (meta) onsaved?.(meta);
			}
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : i18n.t('ADMIN_NEXT.MEDIA.METADATA.SAVE_FAILED'),
			);
		} finally {
			saving = false;
		}
	}

	function reset() {
		values = structuredClone(baseline);
		for (const key of Object.keys(tagDrafts)) tagDrafts[key] = '';
	}

	// (Re)load whenever the target file changes.
	$effect(() => {
		if (filename && filename !== loadedFor) {
			loadedFor = filename;
			void doLoad();
		}
	});
</script>

<div class="space-y-3">
	{#if loading}
		<div class="space-y-3">
			{#each [1, 2, 3] as _}
				<div class="h-9 animate-pulse rounded-md bg-muted"></div>
			{/each}
		</div>
	{:else if error}
		<p class="text-sm text-destructive">{error}</p>
	{:else if meta}
		{#if meta.fields.length === 0}
			<p class="text-sm text-muted-foreground">{i18n.t('ADMIN_NEXT.MEDIA.METADATA.EMPTY')}</p>
		{:else}
			{#each meta.fields as field (field.key)}
				<div>
					<label
						for={`meta-${field.key}`}
						class="text-[0.6875rem] font-medium text-muted-foreground"
					>
						{field.label}
					</label>
					{#if field.type === 'tags'}
						<div
							class="mt-1 flex flex-wrap items-center gap-1 rounded-md border border-input bg-transparent px-1.5 py-1 focus-within:ring-1 focus-within:ring-ring {readonly ||
							saving
								? 'opacity-60'
								: ''}"
						>
							{#each tags(field.key) as tag, i (tag)}
								<span
									class="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs text-foreground"
								>
									{tag}
									{#if !readonly}
										<button
											type="button"
											class="text-muted-foreground hover:text-foreground"
											onclick={() => removeTag(field.key, i)}
											aria-label={i18n.t('ADMIN_NEXT.DELETE')}
											disabled={saving}
										>
											<X size={11} />
										</button>
									{/if}
								</span>
							{/each}
							{#if !readonly}
								<input
									id={`meta-${field.key}`}
									type="text"
									class="min-w-[6rem] flex-1 bg-transparent px-1 py-0.5 text-sm focus:outline-none disabled:opacity-60"
									placeholder={i18n.t('ADMIN_NEXT.MEDIA.METADATA.TAGS_PLACEHOLDER')}
									disabled={saving}
									bind:value={tagDrafts[field.key]}
									onkeydown={(e) => handleTagKeydown(e, field.key)}
									onblur={() => addTag(field.key, tagDrafts[field.key] ?? '')}
								/>
							{/if}
						</div>
					{:else if field.type === 'textarea'}
						<textarea
							id={`meta-${field.key}`}
							class="mt-1 w-full resize-y rounded-md border border-input bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
							rows="2"
							disabled={readonly || saving}
							value={typeof values[field.key] === 'string' ? (values[field.key] as string) : ''}
							oninput={(e) => (values[field.key] = e.currentTarget.value)}
						></textarea>
					{:else}
						<input
							id={`meta-${field.key}`}
							type="text"
							class="mt-1 w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
							disabled={readonly || saving}
							value={typeof values[field.key] === 'string' ? (values[field.key] as string) : ''}
							oninput={(e) => (values[field.key] = e.currentTarget.value)}
						/>
					{/if}
				</div>
			{/each}

			{#if !readonly}
				<div class="flex items-center gap-2 pt-1">
					<Button size="sm" onclick={doSave} disabled={!dirty || saving}>
						{#if saving}
							{i18n.t('ADMIN_NEXT.MEDIA.METADATA.SAVING')}
						{:else if isBatch}
							{i18n.t('ADMIN_NEXT.MEDIA.METADATA.APPLY_TO_N', { n: batchCount })}
						{:else}
							{i18n.t('ADMIN_NEXT.SAVE')}
						{/if}
					</Button>
					<Button variant="outline" size="sm" onclick={reset} disabled={!dirty || saving}>
						{i18n.t('ADMIN_NEXT.MEDIA.METADATA.RESET')}
					</Button>
				</div>
			{/if}
		{/if}

		{#if extraEntries.length > 0}
			<details class="mt-2 rounded-md border border-border bg-muted/30 px-3 py-2">
				<summary class="cursor-pointer text-[0.6875rem] font-medium text-muted-foreground">
					{i18n.t('ADMIN_NEXT.MEDIA.METADATA.STORED')}
				</summary>
				<dl class="mt-2 space-y-1">
					{#each extraEntries as entry (entry.key)}
						<div class="flex gap-2 text-xs">
							<dt class="shrink-0 font-mono text-muted-foreground">{entry.key}</dt>
							<dd class="min-w-0 break-words text-foreground">{entry.value}</dd>
						</div>
					{/each}
				</dl>
			</details>
		{/if}
	{/if}
</div>
