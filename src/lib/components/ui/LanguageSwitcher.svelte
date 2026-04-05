<script lang="ts">
	import { contentLang } from '$lib/stores/contentLang.svelte';
	import { ChevronDown, Languages } from 'lucide-svelte';

	interface Props {
		compact?: boolean;
		translatedLangs?: string[];
		onchange?: (lang: string) => void;
	}

	let { compact = false, translatedLangs, onchange }: Props = $props();
	let open = $state(false);

	function select(code: string) {
		open = false;
		if (code === contentLang.activeLang) return;
		contentLang.setLanguage(code);
		onchange?.(code);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') open = false;
	}
</script>

{#if contentLang.enabled && contentLang.languages.length > 1}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="relative" onkeydown={handleKeydown}>
		<button
			class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] font-medium transition-colors
				{open ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}"
			onclick={() => open = !open}
			title="Switch content language"
		>
			<Languages size={14} />
			<span class="font-semibold uppercase">{contentLang.activeLang}</span>
			{#if !compact}
				<span class="hidden sm:inline">{contentLang.getLanguageName(contentLang.activeLang)}</span>
			{/if}
			<ChevronDown size={12} class="ml-0.5 transition-transform {open ? 'rotate-180' : ''}" />
		</button>

		{#if open}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div
				class="fixed inset-0 z-40"
				onclick={() => open = false}
			></div>
			<div class="absolute right-0 z-50 mt-1 min-w-[180px] rounded-md border border-border bg-popover py-1 shadow-md">
				{#each contentLang.languages as lang}
					{@const isTranslated = !translatedLangs || translatedLangs.includes(lang.code)}
					<button
						class="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] transition-colors
							{lang.code === contentLang.activeLang
								? 'bg-accent text-accent-foreground font-medium'
								: 'text-popover-foreground hover:bg-accent/50'}"
						onclick={() => select(lang.code)}
					>
						<span class="inline-flex h-5 w-6 items-center justify-center rounded text-[10px] font-bold uppercase
							{lang.code === contentLang.activeLang
								? 'bg-primary text-primary-foreground'
								: isTranslated
									? 'bg-muted text-muted-foreground'
									: 'bg-muted/50 text-muted-foreground/40'}"
						>{lang.code}</span>
						<span class={isTranslated ? '' : 'text-muted-foreground/60'}>{lang.native_name || lang.name}</span>
						{#if !isTranslated}
							<span class="ml-auto text-[10px] italic text-muted-foreground/50">not translated</span>
						{:else if lang.is_default}
							<span class="ml-auto text-[10px] text-muted-foreground">default</span>
						{/if}
					</button>
				{/each}
			</div>
		{/if}
	</div>
{/if}
