<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { FileText } from 'lucide-svelte';

	/**
	 * Small "Changelog" link shown beside a plugin/theme's "Update available"
	 * badge or Update button. It opens the changelog modal with what the new
	 * version changes, not the installed version's CHANGELOG.md (the plain
	 * Changelog link in the meta-links row does that).
	 */
	interface Props {
		version: string | null | undefined;
		onclick: () => void;
	}

	let { version, onclick }: Props = $props();

	const title = $derived(i18n.t('ADMIN_NEXT.UPDATE_CHANGELOG_TITLE', { version: version ?? '' }));
</script>

<button
	type="button"
	class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
	{title}
	{onclick}
>
	<FileText size={12} /> {i18n.t('ADMIN_NEXT.PLUGINS.CHANGELOG')}
</button>
