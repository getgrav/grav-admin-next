<script lang="ts">
	import { renderMarkdownInline, sanitizeHtml, highlightMatchInHtml } from '$lib/utils/markdown';
	import { textMatches } from '$lib/utils/query-match';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { prefs } from '$lib/stores/preferences.svelte';
	import HelpTip from '$lib/components/ui/HelpTip.svelte';

	/**
	 * A field's help text, drawn the way the Help text setting says: a paragraph
	 * under the label, or a small info icon next to the label that opens a
	 * tooltip. Every blueprint field draws its help through this component, so
	 * the mode is decided here and nowhere else.
	 *
	 * The help is HTML from whoever shipped the blueprint, so it always goes
	 * through `sanitizeHtml`. `sublabel` is not help: it is part of the label and
	 * stays under it in both modes (see FieldLabel).
	 *
	 * The icon and the paragraph belong in different places in some layouts, so
	 * `part` can ask for just one of them. Both parts decide the mode the same
	 * way, so a field that draws the icon in its label and the paragraph further
	 * down still ends up with exactly one.
	 *
	 * Text is always shown inline when there is no label to hang an icon on, and
	 * while a section-search term matches it, so the highlight can be seen.
	 */
	interface Props {
		/** The field's `help`: an HTML string or a translation key. */
		help?: string;
		/** The field's `label`, used to name the icon for screen readers. */
		label?: string;
		/** A toggle's `description`, which it draws under the label like help. */
		description?: string;
		/** `description` is markdown rather than HTML. */
		markdown?: boolean;
		/** Section-search term to highlight; also keeps matching help inline. */
		filter?: string;
		/** The help is plain text, not HTML, and is used as given (a dialog field). */
		plain?: boolean;
		/** Draw only the icon or only the paragraph; the default draws whichever the mode calls for. */
		part?: 'both' | 'icon' | 'text';
		/** Element for the inline help. The markdown editor keeps it a `<span>`. */
		tag?: 'p' | 'span';
		/** Spacing on the inline help, for a layout that indents it. */
		class?: string;
		/** The icon sits in a flex label whose gap already spaces it. */
		flush?: boolean;
	}

	let {
		help,
		label,
		description,
		markdown = false,
		filter,
		plain = false,
		part = 'both',
		tag = 'p',
		class: spacing = 'mt-0.5',
		flush = false,
	}: Props = $props();

	const helpText = $derived(plain ? (help ?? '') : i18n.tMaybe(help));
	const descriptionText = $derived(description ? i18n.tMaybe(description) : '');
	const labelText = $derived(label ? i18n.tMaybe(label) : '');

	const hasContent = $derived(!!helpText || !!descriptionText);

	// Does the search term hit the help text itself (not its tags)?
	const filterHit = $derived(
		!!filter &&
			textMatches(`${sanitizeHtml(helpText)} ${sanitizeHtml(descriptionText)}`.replace(/<[^>]*>/g, ''), filter)
	);

	const inline = $derived(prefs.helpMode !== 'tooltip' || !labelText || filterHit);

	const classes = $derived(`text-xs text-muted-foreground ${spacing}`.trim());
</script>

{#snippet helpBody()}
	{#if plain}{helpText}{:else if filter}{@html highlightMatchInHtml(helpText, filter)}{:else}{@html sanitizeHtml(helpText)}{/if}
{/snippet}

{#snippet descriptionBody()}
	{#if markdown}{@html renderMarkdownInline(descriptionText)}{:else}{@html sanitizeHtml(descriptionText)}{/if}
{/snippet}

{#if hasContent}
	{#if inline}
		{#if part !== 'icon'}
			{#if helpText}
				<svelte:element this={tag} class={classes}>{@render helpBody()}</svelte:element>
			{/if}
			{#if descriptionText}
				<p class={classes}>{@render descriptionBody()}</p>
			{/if}
		{/if}
	{:else if part !== 'text'}
		<HelpTip label={labelText} {flush}>
			{#if helpText}<p>{@render helpBody()}</p>{/if}
			{#if descriptionText}<p>{@render descriptionBody()}</p>{/if}
		</HelpTip>
	{/if}
{/if}
