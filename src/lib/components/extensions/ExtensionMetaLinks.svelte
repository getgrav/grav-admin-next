<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { ExternalLink, BookOpen, FileText, Book, Bug, Globe, User } from 'lucide-svelte';
	import type { PackageAuthor } from '$lib/api/endpoints/gpm';
	import { hostname, sameUrl } from '$lib/utils/url';

	/**
	 * Shared meta-links row shown under a plugin/theme description. Keeps the
	 * plugin and theme detail screens (and any future extension surface)
	 * consistent: author linked to its own URL, useful Documentation / Report an
	 * Issue links pulled from the blueprint, plus README and Changelog. The
	 * generic "Homepage → Visit" is gone; the homepage only appears when it adds
	 * information beyond the author URL, shown as its bare hostname so there's no
	 * label hiding the actual destination.
	 */
	interface Extension {
		author?: PackageAuthor | null;
		homepage?: string | null;
		docs?: string | null;
		bugs?: string | null;
	}

	interface Props {
		extension: Extension;
		changelogLabel: string;
		onReadme: () => void;
		onChangelog: () => void;
	}

	let { extension, changelogLabel, onReadme, onChangelog }: Props = $props();

	const authorUrl = $derived(extension.author?.url ?? null);
	const authorName = $derived(extension.author?.name ?? null);

	// Show the homepage only when it carries information beyond the author URL —
	// many blueprints set homepage to (a duplicate of) the author site.
	const showHomepage = $derived(!!extension.homepage && !sameUrl(extension.homepage, authorUrl));
</script>

<div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
	{#if authorUrl}
		<a href={authorUrl} target="_blank" rel="noopener" class="inline-flex items-center gap-1 hover:text-foreground">
			<User size={10} /> {authorName || hostname(authorUrl)} <ExternalLink size={10} />
		</a>
	{:else if authorName}
		<span class="inline-flex items-center gap-1"><User size={10} /> {authorName}</span>
	{/if}

	{#if showHomepage && extension.homepage}
		<a href={extension.homepage} target="_blank" rel="noopener" class="inline-flex items-center gap-1 hover:text-foreground">
			<Globe size={10} /> {hostname(extension.homepage)} <ExternalLink size={10} />
		</a>
	{/if}

	<button type="button" class="inline-flex items-center gap-1 hover:text-foreground" onclick={onReadme}>
		<BookOpen size={10} /> {i18n.t('ADMIN_NEXT.README')}
	</button>

	<button type="button" class="inline-flex items-center gap-1 hover:text-foreground" onclick={onChangelog}>
		<FileText size={10} /> {changelogLabel}
	</button>

	{#if extension.docs}
		<a href={extension.docs} target="_blank" rel="noopener" class="inline-flex items-center gap-1 hover:text-foreground">
			<Book size={10} /> {i18n.t('ADMIN_NEXT.DOCUMENTATION')} <ExternalLink size={10} />
		</a>
	{/if}

	{#if extension.bugs}
		<a href={extension.bugs} target="_blank" rel="noopener" class="inline-flex items-center gap-1 hover:text-foreground">
			<Bug size={10} /> {i18n.t('ADMIN_NEXT.REPORT_ISSUE')} <ExternalLink size={10} />
		</a>
	{/if}
</div>
