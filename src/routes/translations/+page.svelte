<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import StickyHeader from '$lib/components/ui/StickyHeader.svelte';
	import TranslationsPanel from '$lib/components/translations/TranslationsPanel.svelte';
	import TranslationStringsImportCard from '$lib/components/translations/TranslationStringsImportCard.svelte';

	// Bumped when the import finishes so the matrix refetches — the imported
	// overrides are exactly the rows on screen.
	let importedAt = $state(0);
</script>

<svelte:head>
	<title>{i18n.t('ADMIN_NEXT.TRANSLATIONS.TITLE')}</title>
</svelte:head>

<div>
	<StickyHeader>
		{#snippet children({ scrolled })}
			<div class="px-6 transition-[padding] duration-200 {scrolled ? 'py-2' : 'pt-6 pb-4'}">
				<h1
					class="font-semibold tracking-tight text-foreground transition-[font-size] duration-200 {scrolled
						? 'text-sm'
						: 'text-xl'}"
				>
					{i18n.t('ADMIN_NEXT.TRANSLATIONS.TITLE')}
				</h1>
				{#if !scrolled}
					<p class="mt-0.5 max-w-4xl text-xs text-muted-foreground">
						{i18n.t('ADMIN_NEXT.TRANSLATIONS.DESCRIPTION')}
					</p>
				{/if}
			</div>
		{/snippet}
	</StickyHeader>

	<div class="space-y-4 px-6 pb-6 pt-4">
		<TranslationStringsImportCard onimported={() => (importedAt = Date.now())} />
		{#key importedAt}
			<TranslationsPanel />
		{/key}
	</div>
</div>
