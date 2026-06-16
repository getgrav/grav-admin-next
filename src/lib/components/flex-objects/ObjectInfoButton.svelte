<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { Info, Copy, Check } from 'lucide-svelte';
	import type { FlexObjectMeta } from '$lib/api/endpoints/flexObjects';

	interface Props {
		meta: FlexObjectMeta;
		/** Human-readable directory title (falls back to the type slug). */
		directoryTitle?: string;
		/** Which edge the panel aligns to relative to the trigger. */
		align?: 'start' | 'end';
	}

	let { meta, directoryTitle, align = 'start' }: Props = $props();

	let open = $state(false);
	let copiedField = $state<string | null>(null);

	const directoryLabel = $derived(
		directoryTitle && directoryTitle !== meta.type
			? `${directoryTitle} (${meta.type})`
			: meta.type,
	);

	// Only show the storage key when it differs from the visible id — for many
	// directories they're identical and the extra row is just noise.
	const showStorageKey = $derived(meta.storageKey && meta.storageKey !== meta.key);

	async function copy(field: string, text: string) {
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			const ta = document.createElement('textarea');
			ta.value = text;
			ta.style.position = 'fixed';
			ta.style.opacity = '0';
			document.body.appendChild(ta);
			ta.select();
			document.execCommand('copy');
			document.body.removeChild(ta);
		}
		copiedField = field;
		setTimeout(() => {
			if (copiedField === field) copiedField = null;
		}, 2000);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') open = false;
	}

	function handleClickOutside(e: MouseEvent) {
		if (!(e.target as HTMLElement).closest('.object-info-popover')) {
			open = false;
		}
	}

	$effect(() => {
		if (open) {
			document.addEventListener('mousedown', handleClickOutside);
			return () => document.removeEventListener('mousedown', handleClickOutside);
		}
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="object-info-popover relative" onkeydown={handleKeydown}>
	<button
		type="button"
		class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground {open ? 'bg-accent text-foreground' : ''}"
		title={i18n.t('ADMIN_NEXT.FLEX_OBJECTS.INFO.SHOW_INFO')}
		aria-label={i18n.t('ADMIN_NEXT.FLEX_OBJECTS.INFO.SHOW_INFO')}
		aria-expanded={open}
		onclick={() => (open = !open)}
	>
		<Info size={16} />
	</button>

	{#if open}
		<div
			class="absolute top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-popover shadow-lg {align === 'end' ? 'end-0' : 'start-0'}"
		>
			<div class="border-b border-border px-4 py-2.5">
				<h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					{i18n.t('ADMIN_NEXT.FLEX_OBJECTS.INFO.TITLE')}
				</h2>
			</div>

			<div class="space-y-3 px-4 py-3">
				{@render row(
					i18n.t('ADMIN_NEXT.FLEX_OBJECTS.INFO.ID'),
					meta.key,
					'id',
					true,
				)}

				{@render row(
					i18n.t('ADMIN_NEXT.FLEX_OBJECTS.INFO.DIRECTORY'),
					directoryLabel,
					'directory',
					false,
				)}

				{#if showStorageKey}
					{@render row(
						i18n.t('ADMIN_NEXT.FLEX_OBJECTS.INFO.STORAGE_KEY'),
						meta.storageKey,
						'storageKey',
						true,
					)}
				{/if}

				{#if meta.storagePath}
					{@render row(
						i18n.t('ADMIN_NEXT.FLEX_OBJECTS.INFO.LOCATION'),
						meta.storagePath,
						'location',
						true,
					)}
				{/if}
			</div>
		</div>
	{/if}
</div>

{#snippet row(label: string, value: string, field: string, copyable: boolean)}
	<div>
		<div class="flex items-center justify-between gap-2">
			<span class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
				{label}
			</span>
			{#if copyable}
				<button
					type="button"
					class="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					title={i18n.t('ADMIN_NEXT.COPY_BUTTON.COPY')}
					aria-label={i18n.t('ADMIN_NEXT.COPY_BUTTON.COPY')}
					onclick={() => copy(field, value)}
				>
					{#if copiedField === field}
						<Check size={13} class="text-emerald-500" />
					{:else}
						<Copy size={13} />
					{/if}
				</button>
			{/if}
		</div>
		<p class="mt-0.5 break-all font-mono text-xs text-foreground">{value}</p>
	</div>
{/snippet}
