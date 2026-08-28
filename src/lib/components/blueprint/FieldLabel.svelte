<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { renderMarkdownInline, sanitizeHtml, highlightMatch } from '$lib/utils/markdown';
	import { i18n } from '$lib/stores/i18n.svelte';
	import FieldOverrideIndicator from './FieldOverrideIndicator.svelte';

	/**
	 * The label column of a field: label, sublabel, help, the required marker and
	 * the config-override indicator.
	 *
	 * Extracted so FieldRenderer and SectionField share one implementation. The
	 * two used to carry near-identical copies of this markup, which is how
	 * `sublabel` and `labelclasses` ended up rendered by neither
	 * (grav-admin-next#18).
	 */
	interface Props {
		field: BlueprintField;
		/** Toggleable state — an off field dims its label to match the input. */
		toggled?: boolean;
		/**
		 * Section-search term to highlight. A string rather than a highlighter
		 * function on purpose: the label and help below are package-authored and
		 * feed `{@html …}`, so this component does its own escaping rather than
		 * trusting whatever a caller passes in.
		 */
		filter?: string;
	}

	let { field, toggled = true, filter }: Props = $props();
</script>

{#if field.label}
	<span
		class="inline-flex items-center gap-1.5 text-sm font-semibold {toggled
			? 'text-foreground'
			: 'text-muted-foreground'} {field.labelclasses ?? ''}"
	>
		{#if filter}
			{@html highlightMatch(i18n.tMaybe(field.label), filter)}
		{:else}
			{i18n.tMaybe(field.label)}
		{/if}
		{#if field.validate?.required}<span class="text-red-500">*</span>{/if}
		<FieldOverrideIndicator path={field.name} />
	</span>
{/if}
{#if field.sublabel}
	{@const sublabel = i18n.tMaybe(field.sublabel)}
	<p class="mt-0.5 text-xs text-muted-foreground {field.sublabelclasses ?? ''}">
		{#if field.markdown}{@html renderMarkdownInline(sublabel)}{:else}{sublabel}{/if}
	</p>
{/if}
{#if field.help}
	<p class="mt-0.5 text-xs text-muted-foreground">
		{#if filter}
			{@html highlightMatch(i18n.tMaybe(field.help), filter)}
		{:else}
			{@html sanitizeHtml(i18n.tMaybe(field.help))}
		{/if}
	</p>
{/if}
