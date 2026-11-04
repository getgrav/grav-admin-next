<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { ArrowUpCircle } from 'lucide-svelte';

	/**
	 * The one "update available" marker for a plugin or theme: an amber pill
	 * with the version the update would install. Every list row, table cell
	 * and detail header shows the same pill, so an update looks the same
	 * wherever it turns up. `long` spells it out ("Update available: v1.2.3")
	 * where there's room; the short form carries the same text in its tooltip.
	 */
	interface Props {
		version: string | null | undefined;
		long?: boolean;
		class?: string;
	}

	let { version, long = false, class: className = '' }: Props = $props();

	const label = $derived(i18n.t('ADMIN_NEXT.UPDATE_AVAILABLE_VERSION', { version: version ?? '' }));
</script>

<span
	class="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.6875rem] font-medium whitespace-nowrap tabular-nums text-amber-700 dark:text-amber-400 {className}"
	title={long ? undefined : label}
	aria-label={long ? undefined : label}
>
	<ArrowUpCircle size={11} aria-hidden="true" />
	{#if long}{label}{:else}v{version}{/if}
</span>
