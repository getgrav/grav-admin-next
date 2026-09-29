<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';

	interface Props {
		translated?: string[];
		currentLang?: string;
		/**
		 * Narrow placements (the Miller columns) can't fit one chip per language:
		 * a site with seven xx-xx locales needs ~280px of badges. Compact mode shows
		 * the current language plus a translated/enabled count, tinted when any
		 * enabled language is missing, with both lists in the tooltip.
		 */
		compact?: boolean;
		/** Enabled language codes, for the compact count and missing list. */
		languages?: string[];
		/** Compact chips sit on a primary-coloured (selected) row. */
		inverted?: boolean;
	}

	let { translated, currentLang, compact = false, languages = [], inverted = false }: Props = $props();

	// Grav core's flex `translatedLanguages()` can return a `''` key alongside
	// the resolved language code on pages that have an untyped `item.md`
	// (it appends `''` to its language list and doesn't always prune it back
	// out — see PageTranslateTrait::translatedLanguages). Filter falsy entries
	// here so every caller is protected without each copy of the badgeKeys
	// derivation having to remember.
	const visible = $derived((translated ?? []).filter((lang): lang is string => !!lang));
	const showCurrent = $derived(!!currentLang && visible.includes(currentLang));
	const missing = $derived(languages.filter((lang) => !visible.includes(lang)));
	const tooltip = $derived(
		visible.join(', ').toUpperCase()
		+ (missing.length ? ` · ${i18n.t('ADMIN_NEXT.LANG.NOT_TRANSLATED')}: ${missing.join(', ').toUpperCase()}` : '')
	);
</script>

{#if visible.length > 0}
	{#if compact}
		<div class="inline-flex shrink-0 items-center gap-0.5" title={tooltip}>
			{#if showCurrent}
				<span class="inline-flex h-4 shrink-0 items-center whitespace-nowrap rounded px-1 text-[0.5625rem] font-bold uppercase leading-none
					{inverted ? 'bg-primary-foreground text-primary' : 'bg-primary text-primary-foreground'}">{currentLang}</span>
			{/if}
			<span
				class="inline-flex h-4 shrink-0 items-center whitespace-nowrap rounded px-1 text-[0.5625rem] font-bold leading-none tabular-nums
					{inverted
						? 'bg-primary-foreground/20 text-primary-foreground'
						: missing.length ? 'bg-warning/15 text-warning' : 'bg-muted text-muted-foreground'}"
			>{languages.length ? `${visible.length}/${languages.length}` : visible.length}</span>
		</div>
	{:else}
		<div class="inline-flex shrink-0 items-center gap-0.5">
			{#each visible as lang (lang)}
				<span
					class="inline-flex h-4 shrink-0 items-center whitespace-nowrap rounded px-1 text-[0.5625rem] font-bold uppercase leading-none
						{lang === currentLang
							? 'bg-primary text-primary-foreground'
							: 'bg-muted text-muted-foreground'}"
					title={lang}
				>{lang}</span>
			{/each}
		</div>
	{/if}
{/if}
