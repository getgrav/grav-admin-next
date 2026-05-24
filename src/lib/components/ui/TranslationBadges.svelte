<script lang="ts">
	interface Props {
		translated?: string[];
		currentLang?: string;
	}

	let { translated, currentLang }: Props = $props();

	// Grav core's flex `translatedLanguages()` can return a `''` key alongside
	// the resolved language code on pages that have an untyped `item.md`
	// (it appends `''` to its language list and doesn't always prune it back
	// out — see PageTranslateTrait::translatedLanguages). Filter falsy entries
	// here so every caller is protected without each copy of the badgeKeys
	// derivation having to remember.
	const visible = $derived((translated ?? []).filter((lang): lang is string => !!lang));
</script>

{#if visible.length > 0}
	<div class="inline-flex items-center gap-0.5">
		{#each visible as lang (lang)}
			<span
				class="inline-flex h-4 items-center rounded px-1 text-[0.5625rem] font-bold uppercase leading-none
					{lang === currentLang
						? 'bg-primary text-primary-foreground'
						: 'bg-muted text-muted-foreground'}"
				title={lang}
			>{lang}</span>
		{/each}
	</div>
{/if}
