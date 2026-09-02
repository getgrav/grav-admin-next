<script lang="ts">
	import { Search, X } from 'lucide-svelte';
	import { i18n } from '$lib/stores/i18n.svelte';

	interface Props {
		/** The current filter text. Bind to it. */
		value: string;
		/** Extra classes for the wrapper, so a page can size the box its own way. */
		class?: string;
	}

	let { value = $bindable(''), class: className = 'w-full sm:w-48' }: Props = $props();
</script>

<div class="relative {className}">
	<Search size={14} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
	<input
		type="text"
		class="h-8 w-full rounded-md border border-input bg-transparent ps-9 pe-8 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
		placeholder={i18n.t('ADMIN_NEXT.CONFIG.FILTER_FIELDS')}
		bind:value
	/>
	{#if value}
		<button
			class="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground"
			onclick={() => (value = '')}
			aria-label={i18n.t('ADMIN_NEXT.CONFIG.CLEAR_FILTER')}
		>
			<X size={14} />
		</button>
	{/if}
</div>
