<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { Button } from '$lib/components/ui/button';
	import { FileText } from 'lucide-svelte';

	/**
	 * "What's new": opens the changelog modal with what the available update
	 * changes (the entries newer than the installed version), not the installed
	 * version's whole CHANGELOG.md, which the plain Changelog link in the
	 * meta-links row shows. A `link` sits in a line of text beside the update
	 * badge; a `button` stands in a toolbar beside the Update button.
	 */
	interface Props {
		version: string | null | undefined;
		onclick: () => void;
		variant?: 'link' | 'button';
	}

	let { version, onclick, variant = 'link' }: Props = $props();

	const title = $derived(i18n.t('ADMIN_NEXT.UPDATE_CHANGELOG_TITLE', { version: version ?? '' }));
	const label = $derived(i18n.t('ADMIN_NEXT.UPDATE_WHATS_NEW'));
</script>

{#if variant === 'button'}
	<Button variant="outline" size="sm" {title} aria-label={title} {onclick}>
		<FileText size={14} />
		<span class="hidden sm:inline">{label}</span>
	</Button>
{:else}
	<button
		type="button"
		class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
		{title}
		{onclick}
	>
		<FileText size={12} /> {label}
	</button>
{/if}
