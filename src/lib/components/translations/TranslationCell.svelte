<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	// `Languages` is the same glyph ai-translate puts on its in-field buttons in
	// the page editor, so the action reads as the same action here.
	import { Undo2, Check, X, Sparkles, Loader2, Languages } from 'lucide-svelte';
	import type { TranslationCell } from '$lib/api/endpoints/translations';

	interface Props {
		cell: TranslationCell | undefined;
		/**
		 * Source-language value shown as ghost text when this cell is missing —
		 * what the visitor actually sees, since Grav falls back rather than
		 * rendering nothing.
		 */
		fallback: string | null;
		/** A staged machine translation awaiting review. Nothing is written yet. */
		proposal?: string | null;
		/** False only when the translate action makes no sense here at all. */
		canTranslate?: boolean;
		/**
		 * When set, machine translation isn't usable and this says why. The
		 * button still renders, greyed, and takes you to the fix.
		 */
		translateDisabledReason?: string | null;
		/**
		 * True on the source column, where the button fills every open language
		 * for this row rather than this one cell.
		 */
		isSource?: boolean;
		busy?: boolean;
		onsave: (value: string | null) => void;
		onaccept?: () => void;
		ondiscard?: () => void;
		ontranslate?: () => void;
		ontranslateunavailable?: () => void;
	}

	let {
		cell,
		fallback,
		proposal = null,
		canTranslate = false,
		translateDisabledReason = null,
		isSource = false,
		busy = false,
		onsave,
		onaccept,
		ondiscard,
		ontranslate,
		ontranslateunavailable,
	}: Props = $props();

	const translateOff = $derived(translateDisabledReason !== null);

	let editing = $state(false);
	let draft = $state('');
	let input = $state<HTMLTextAreaElement | null>(null);

	const cellState = $derived(cell?.state ?? 'missing');
	const value = $derived(cell?.value ?? null);

	const translateTitle = $derived(
		translateDisabledReason !== null
			? translateDisabledReason
			: isSource
				? i18n.t('ADMIN_NEXT.TRANSLATIONS.TRANSLATE_ROW')
				: i18n.t('ADMIN_NEXT.TRANSLATIONS.TRANSLATE_THIS')
	);

	/**
	 * The three states carry different weight, so they read differently at a
	 * glance: an override is emphasized (you did this), a missing value is
	 * flagged, and a shipped value stays quiet.
	 */
	const stateClasses: Record<string, string> = {
		shipped: 'border-transparent',
		overridden: 'border-primary/40 bg-primary/5',
		missing: 'border-amber-500/30 bg-amber-500/5',
	};

	function beginEdit() {
		if (editing) return;
		draft = value ?? '';
		editing = true;
		queueMicrotask(() => {
			input?.focus();
			input?.select();
		});
	}

	function commit() {
		if (!editing) return;
		editing = false;
		const next = draft;
		// An empty edit of a value that exists means "remove my override", not
		// "store an empty string" — the latter would blank the string on the site.
		if (next === (value ?? '')) return;
		onsave(next === '' ? null : next);
	}

	function cancel() {
		editing = false;
		draft = '';
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			cancel();
		} else if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			commit();
		}
	}
</script>

<div class="group relative">
	{#if editing}
		<textarea
			bind:this={input}
			bind:value={draft}
			rows={Math.min(6, Math.max(1, draft.split('\n').length))}
			class="w-full resize-y rounded border border-ring bg-background px-2 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
			onblur={commit}
			onkeydown={onKeydown}
		></textarea>
		<p class="mt-1 text-[10px] text-muted-foreground">
			{i18n.t('ADMIN_NEXT.TRANSLATIONS.EDIT_HINT')}
		</p>
	{:else}
		<button
			type="button"
			class="w-full rounded border px-2 py-1 text-start text-sm hover:border-input hover:bg-accent/50 {stateClasses[cellState]} {canTranslate ? 'pe-8' : ''}"
			onclick={beginEdit}
			title={cellState === 'overridden' && cell?.shipped !== null
				? i18n.t('ADMIN_NEXT.TRANSLATIONS.SHIPPED_VALUE', { value: cell?.shipped ?? '' })
				: undefined}
		>
			{#if value !== null}
				<span class="whitespace-pre-wrap break-words text-foreground">{value}</span>
			{:else if fallback !== null}
				<span class="whitespace-pre-wrap break-words italic text-muted-foreground">{fallback}</span>
			{:else}
				<span class="text-muted-foreground">&mdash;</span>
			{/if}
		</button>

		{#if canTranslate}
			<!--
				Sits inside the value box, matching where ai-translate puts its button
				on page-editor fields. Always visible, never hover-gated: a control
				that only appears once you happen to hover the right cell may as well
				not exist, which is exactly how it read.
			-->
			<button
				type="button"
				class="absolute end-1 top-1 flex h-6 w-6 items-center justify-center rounded-md border border-border/60 bg-background/80 shadow-sm backdrop-blur-sm transition disabled:opacity-50 {translateOff
					? 'cursor-help text-muted-foreground/50 hover:text-muted-foreground opacity-60'
					: 'text-muted-foreground hover:border-input hover:bg-background hover:text-primary'} {!translateOff &&
				cellState === 'missing'
					? 'opacity-100'
					: translateOff
						? ''
						: 'opacity-70 group-hover:opacity-100'}"
				disabled={busy}
				onclick={() => (translateOff ? ontranslateunavailable?.() : ontranslate?.())}
				title={translateTitle}
				aria-label={translateTitle}
				aria-disabled={translateOff}
			>
				{#if busy}
					<Loader2 size={13} class="animate-spin" />
				{:else}
					<Languages size={13} />
				{/if}
			</button>
		{/if}

		{#if proposal !== null}
			<div class="mt-1 rounded border border-dashed border-primary/50 bg-primary/5 px-2 py-1">
				<div class="mb-1 flex items-center gap-1 text-[10px] font-medium text-primary">
					<Sparkles size={10} />
					{i18n.t('ADMIN_NEXT.TRANSLATIONS.SUGGESTED')}
				</div>
				<div class="whitespace-pre-wrap break-words text-sm text-foreground">{proposal}</div>
				<div class="mt-1 flex items-center gap-2">
					<button
						type="button"
						class="flex items-center gap-0.5 text-[10px] font-medium text-primary hover:underline"
						onclick={() => onaccept?.()}
					>
						<Check size={10} />
						{i18n.t('ADMIN_NEXT.TRANSLATIONS.ACCEPT')}
					</button>
					<button
						type="button"
						class="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
						onclick={() => ondiscard?.()}
					>
						<X size={10} />
						{i18n.t('ADMIN_NEXT.TRANSLATIONS.DISCARD')}
					</button>
				</div>
			</div>
		{/if}

		{#if cellState === 'overridden'}
			<div class="mt-0.5 flex items-center gap-1.5">
				<span class="text-[10px] font-medium text-primary">
					{i18n.t('ADMIN_NEXT.TRANSLATIONS.STATE_OVERRIDDEN')}
				</span>
				<button
					type="button"
					class="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
					onclick={() => onsave(null)}
					title={i18n.t('ADMIN_NEXT.TRANSLATIONS.REVERT_HELP')}
				>
					<Undo2 size={10} />
					{i18n.t('ADMIN_NEXT.TRANSLATIONS.REVERT')}
				</button>
			</div>
		{/if}
		<!--
			No label for the missing state: it is the common case, so with several
			languages stacked it became a line of amber under every row. The amber
			box and the italic fallback text say it already, and the language gutter
			carries the word.
		-->
	{/if}
</div>
