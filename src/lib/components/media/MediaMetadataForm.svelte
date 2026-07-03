<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
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
	}

	let { filename, load, save, readonly = false, onsaved }: Props = $props();

	let loading = $state(true);
	let saving = $state(false);
	let error = $state<string | null>(null);
	let meta = $state<MediaMetaResponse | null>(null);

	// Current edit buffer and the last-saved baseline, keyed by field key.
	let values = $state<Record<string, string>>({});
	let baseline = $state<Record<string, string>>({});
	let loadedFor = $state('');

	const dirty = $derived.by(() => {
		const keys = new Set([...Object.keys(values), ...Object.keys(baseline)]);
		for (const k of keys) {
			if ((values[k] ?? '') !== (baseline[k] ?? '')) return true;
		}
		return false;
	});

	const extraEntries = $derived.by(() => {
		const extra = meta?.extra ?? {};
		return Object.entries(extra).map(([key, value]) => ({ key, value: formatExtra(value) }));
	});

	function formatExtra(value: unknown): string {
		if (value === null || value === undefined) return '';
		if (typeof value === 'object') return JSON.stringify(value);
		return String(value);
	}

	function applyMeta(res: MediaMetaResponse) {
		meta = res;
		const next: Record<string, string> = {};
		for (const field of res.fields) {
			next[field.key] = field.value ?? '';
		}
		values = { ...next };
		baseline = { ...next };
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
		saving = true;
		try {
			applyMeta(await save({ ...values }));
			toast.success(i18n.t('ADMIN_NEXT.MEDIA.METADATA.SAVED'));
			if (meta) onsaved?.(meta);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : i18n.t('ADMIN_NEXT.MEDIA.METADATA.SAVE_FAILED'),
			);
		} finally {
			saving = false;
		}
	}

	function reset() {
		values = { ...baseline };
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
					{#if field.type === 'textarea'}
						<textarea
							id={`meta-${field.key}`}
							class="mt-1 w-full resize-y rounded-md border border-input bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
							rows="2"
							disabled={readonly || saving}
							bind:value={values[field.key]}
						></textarea>
					{:else}
						<input
							id={`meta-${field.key}`}
							type="text"
							class="mt-1 w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
							disabled={readonly || saving}
							bind:value={values[field.key]}
						/>
					{/if}
				</div>
			{/each}

			{#if !readonly}
				<div class="flex items-center gap-2 pt-1">
					<Button size="sm" onclick={doSave} disabled={!dirty || saving}>
						{saving
							? i18n.t('ADMIN_NEXT.MEDIA.METADATA.SAVING')
							: i18n.t('ADMIN_NEXT.SAVE')}
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
