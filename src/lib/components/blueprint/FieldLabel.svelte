<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { renderMarkdownInline, highlightMatch } from '$lib/utils/markdown';
	import { i18n } from '$lib/stores/i18n.svelte';
	import FieldOverrideIndicator from './FieldOverrideIndicator.svelte';
	import FieldHelp from './FieldHelp.svelte';

	/**
	 * The label column of a field: label, sublabel, help, the required marker and
	 * the config-override indicator. Help is drawn by FieldHelp, which puts it
	 * under the label or behind an icon after the indicator, per the Help text
	 * setting; the sublabel stays under the label either way.
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
		/**
		 * Id of the control this label names. When set the label is a real
		 * `<label for>`, so a click on it toggles or focuses the control and a
		 * screen reader announces it as the control's name; otherwise it stays a
		 * plain `<span>` (a group heading, or a control with no id to point at).
		 */
		controlId?: string;
	}

	let { field, toggled = true, filter, controlId }: Props = $props();
</script>

{#if field.label}
	<svelte:element
		this={controlId ? 'label' : 'span'}
		for={controlId}
		class="inline-flex items-center gap-1.5 text-sm font-semibold {toggled
			? 'text-foreground'
			: 'text-muted-foreground'} {field.labelclasses ?? ''}"
	>
		{#if filter}
			<!-- One element, so the text and its <mark> fragments stay a single
			     flex item: the wrapper's gap would otherwise open up around every
			     highlighted piece. -->
			<span>{@html highlightMatch(i18n.tMaybe(field.label), filter)}</span>
		{:else}
			{i18n.tMaybe(field.label)}
		{/if}
		{#if field.validate?.required}<span class="text-red-500">*</span>{/if}
		<FieldOverrideIndicator path={field.name} />
		<FieldHelp part="icon" help={field.help} label={field.label} {filter} flush />
	</svelte:element>
{/if}
{#if field.sublabel}
	{@const sublabel = i18n.tMaybe(field.sublabel)}
	<p class="mt-0.5 text-xs text-muted-foreground {field.sublabelclasses ?? ''}">
		{#if field.markdown}{@html renderMarkdownInline(sublabel)}{:else}{sublabel}{/if}
	</p>
{/if}
<FieldHelp part="text" help={field.help} label={field.label} {filter} />
