<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import { ChevronsUpDown, X } from 'lucide-svelte';
	import type { MediaMetaField, MediaMetaResponse, MediaMetaValues } from '$lib/api/endpoints/media';
	import {
		dateInputType,
		isEmptyFormValue,
		numberInputType,
		toFormValue,
		toStoredValue,
		type MediaMetaFormValue
	} from '$lib/utils/media-metadata';
	import { scrollToFirstError } from '$lib/utils/blueprint-validation';

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

	type FieldValue = MediaMetaFormValue;

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

	// Inline errors for required fields left empty in the payload, set by the
	// save handler rather than by disabling Save: a form that opens with an
	// empty required field must still be able to say why it cannot save
	// (getgrav/grav-plugin-email#194).
	let errors = $state<Record<string, string>>({});

	/**
	 * Required fields that are empty in the payload about to be sent. A
	 * single-file save sends every field; batch mode sends only the changed
	 * ones, so a required field left untouched there is not a problem.
	 */
	function requiredErrors(sent: Record<string, unknown>): Record<string, string> {
		const out: Record<string, string> = {};
		for (const field of meta?.fields ?? []) {
			if (!field.required || !(field.key in sent)) continue;
			if (!isEmptyFormValue(sent[field.key])) continue;
			out[field.key] = i18n.t('ADMIN_NEXT.VALIDATION.FIELD_REQUIRED', { label: field.label });
		}
		return out;
	}

	function clearError(key: string) {
		if (!(key in errors)) return;
		const next = { ...errors };
		delete next[key];
		errors = next;
	}

	// Re-check a field the moment it is touched, so clearing a required field
	// flags it inline and filling it again clears the flag — the same behaviour
	// as the blueprint form (validateFieldAt), without flagging on load.
	function refreshError(key: string) {
		const field = meta?.fields.find((f) => f.key === key);
		if (!field?.required) {
			clearError(key);
			return;
		}
		if (isEmptyFormValue(values[key])) {
			errors[key] = i18n.t('ADMIN_NEXT.VALIDATION.FIELD_REQUIRED', { label: field.label });
		} else {
			clearError(key);
		}
	}

	// A copy of the loaded metadata with the current edits folded into its
	// fields — used to notify the parent after a batch save (which returns only
	// counts, not a fresh MediaMetaResponse) so the markdown snippet updates.
	function metaWithValues(): MediaMetaResponse | null {
		if (!meta) return null;
		return {
			...meta,
			fields: meta.fields.map((f) => ({
				...f,
				value: toStoredValue(f, values[f.key] ?? ''),
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

	/** The edit buffer's text for a field, for inputs whose `value` must be a string. */
	function textValue(key: string): string {
		const v = values[key];
		return typeof v === 'string' ? v : '';
	}

	// A select's choices: the configured options, plus the stored value when it
	// is no longer one of them so it is shown instead of silently blanked.
	function selectOptions(field: MediaMetaField): [string, string][] {
		const entries = Object.entries(field.options ?? {});
		const current = values[field.key];
		if (typeof current === 'string' && current !== '' && !entries.some(([v]) => v === current)) {
			entries.push([current, current]);
		}
		return entries;
	}

	function addTag(key: string, raw: string) {
		const t = raw.trim();
		tagDrafts[key] = '';
		if (!t) return;
		const arr = tags(key);
		if (!arr.some((x) => x.toLowerCase() === t.toLowerCase())) {
			values[key] = [...arr, t];
			refreshError(key);
		}
	}

	function removeTag(key: string, index: number) {
		values[key] = tags(key).filter((_, i) => i !== index);
		refreshError(key);
	}

	function handleTagKeydown(e: KeyboardEvent, key: string) {
		if (e.key === 'Enter' || e.key === ',') {
			e.preventDefault();
			addTag(key, tagDrafts[key] ?? '');
		} else if (e.key === 'Backspace' && !(tagDrafts[key] ?? '')) {
			const arr = tags(key);
			if (arr.length) {
				values[key] = arr.slice(0, -1);
				refreshError(key);
			}
		}
	}

	function applyMeta(res: MediaMetaResponse) {
		meta = res;
		errors = {};
		const next: Record<string, FieldValue> = {};
		const drafts: Record<string, string> = {};
		for (const field of res.fields) {
			next[field.key] = toFormValue(field);
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
		const missing = requiredErrors(isBatch ? changedFields : values);
		errors = missing;
		const count = Object.keys(missing).length;
		if (count > 0) {
			toast.error(i18n.t('ADMIN_NEXT.VALIDATION.FORM_HAS_ERRORS', { count }));
			scrollToFirstError();
			return;
		}
		saving = true;
		try {
			if (isBatch && saveBatch) {
				const res = await saveBatch({ ...changedFields });
				// The inspected file received the same write as the rest of the
				// selection, so the current edit buffer is now the saved state.
				// A snapshot, not structuredClone: `values` is a $state proxy,
				// which structuredClone rejects after the write has gone through.
				baseline = $state.snapshot(values);
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
		values = $state.snapshot(baseline);
		errors = {};
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
						{#if field.required}
							<span class="text-red-500" aria-hidden="true">*</span>
						{/if}
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
									aria-required={field.required ? 'true' : undefined}
									bind:value={tagDrafts[field.key]}
									onkeydown={(e) => handleTagKeydown(e, field.key)}
									onblur={() => addTag(field.key, tagDrafts[field.key] ?? '')}
								/>
							{/if}
						</div>
					{:else if field.type === 'select'}
						<div class="relative mt-1">
							<select
								id={`meta-${field.key}`}
								class="flex w-full appearance-none rounded-md border border-input bg-transparent ps-2 pe-8 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
								disabled={readonly || saving}
								aria-required={field.required ? 'true' : undefined}
								value={textValue(field.key)}
								onchange={(e) => {
									values[field.key] = e.currentTarget.value;
									refreshError(field.key);
								}}
							>
								<option value=""></option>
								{#each selectOptions(field) as [optValue, optLabel] (optValue)}
									<option value={optValue}>{optLabel}</option>
								{/each}
							</select>
							<div class="pointer-events-none absolute inset-y-0 end-0 flex items-center pe-2.5">
								<ChevronsUpDown size={14} class="text-muted-foreground" />
							</div>
						</div>
					{:else if field.type === 'textarea'}
						<textarea
							id={`meta-${field.key}`}
							class="mt-1 w-full resize-y rounded-md border border-input bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
							rows="2"
							disabled={readonly || saving}
							value={textValue(field.key)}
							oninput={(e) => {
								values[field.key] = e.currentTarget.value;
								refreshError(field.key);
							}}
						></textarea>
					{:else if field.type === 'boolean'}
						{#if typeof values[field.key] === 'boolean'}
							<input
								id={`meta-${field.key}`}
								type="checkbox"
								class="mt-1 h-[18px] w-[18px] shrink-0 appearance-none rounded border border-input bg-muted/50 checked:border-primary checked:bg-primary checked:bg-[url('data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22white%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M12.207%204.793a1%201%200%20010%201.414l-5%205a1%201%200%2001-1.414%200l-2-2a1%201%200%20011.414-1.414L6.5%209.086l4.293-4.293a1%201%200%20011.414%200z%22%2F%3E%3C%2Fsvg%3E')] checked:bg-no-repeat checked:bg-center focus:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
								checked={values[field.key] === true}
								disabled={readonly || saving}
								aria-required={field.required ? 'true' : undefined}
								onchange={(e) => {
									values[field.key] = e.currentTarget.checked;
									refreshError(field.key);
								}}
							/>
						{:else}
							<input
								id={`meta-${field.key}`}
								type="text"
								class="mt-1 w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
								disabled={readonly || saving}
								aria-required={field.required ? 'true' : undefined}
								value={textValue(field.key)}
								oninput={(e) => {
									values[field.key] = e.currentTarget.value;
									refreshError(field.key);
								}}
							/>
						{/if}
					{:else if field.type === 'number'}
						<input
							id={`meta-${field.key}`}
							type={numberInputType(textValue(field.key))}
							class="mt-1 w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
							step="any"
							min={field.min}
							max={field.max}
							disabled={readonly || saving}
							aria-required={field.required ? 'true' : undefined}
							value={textValue(field.key)}
							oninput={(e) => {
								values[field.key] = e.currentTarget.value;
								refreshError(field.key);
							}}
						/>
					{:else if field.type === 'date'}
						<input
							id={`meta-${field.key}`}
							type={dateInputType(textValue(field.key))}
							class="mt-1 w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
							disabled={readonly || saving}
							aria-required={field.required ? 'true' : undefined}
							value={textValue(field.key)}
							oninput={(e) => {
								values[field.key] = e.currentTarget.value;
								refreshError(field.key);
							}}
						/>
					{:else}
						<input
							id={`meta-${field.key}`}
							type="text"
							class="mt-1 w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
							disabled={readonly || saving}
							aria-required={field.required ? 'true' : undefined}
							value={textValue(field.key)}
							oninput={(e) => {
								values[field.key] = e.currentTarget.value;
								refreshError(field.key);
							}}
						/>
					{/if}
					{#if errors[field.key]}
						<p data-field-error class="mt-1 text-xs text-destructive">{errors[field.key]}</p>
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
