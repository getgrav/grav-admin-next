<script lang="ts">
	interface Props {
		translated?: string[];
		currentLang?: string;
	}

	let { translated, currentLang }: Props = $props();
</script>

{#if translated && translated.length > 0}
	<div class="inline-flex items-center gap-0.5">
		{#each translated as lang}
			<span
				class="inline-flex h-4 items-center rounded px-1 text-[9px] font-bold uppercase leading-none
					{lang === currentLang
						? 'bg-primary text-primary-foreground'
						: 'bg-muted text-muted-foreground'}"
				title={lang}
			>{lang}</span>
		{/each}
	</div>
{/if}
