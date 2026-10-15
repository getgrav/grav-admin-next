<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { renderMarkdownInline, sanitizeHtml } from '$lib/utils/markdown';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { getContext } from 'svelte';
	import type { Snippet } from 'svelte';

	/**
	 * The `description` line rendered under a field's input.
	 *
	 * Only a handful of field components ever read `description` themselves, so
	 * it rendered for some types and silently vanished for the rest. Owning it in
	 * the shared field chrome makes it work for every type at once
	 * (grav-admin-next#18).
	 *
	 * The text is HTML, matching admin-classic's `{{ field.description|t|raw }}`
	 * and admin-next's own `help`; it is sanitized rather than trusted outright
	 * because a blueprint can come from a third-party package
	 * (grav-admin-next#19).
	 *
	 * It is also where a page's own notice for a field is drawn. A page that owns
	 * the form hands BlueprintForm a `notices` map of field name to snippet, and the
	 * snippet sits under the description. The user page uses it for an email change
	 * that is waiting for confirmation, which has buttons.
	 */
	interface Props {
		field: BlueprintField;
	}

	let { field }: Props = $props();

	const description = $derived(i18n.tMaybe(field.description));

	// A notice the page that owns the form asked for under this field, set by
	// BlueprintForm's `notices` prop (a field name to a snippet).
	const noticesCtx = getContext<(() => Record<string, Snippet>) | undefined>('fieldNotices');
	const notice = $derived(noticesCtx?.()[field.name]);
</script>

{#if description}
	<p class="mt-2 text-xs text-muted-foreground">
		{#if field.markdown}{@html renderMarkdownInline(description)}{:else}{@html sanitizeHtml(description)}{/if}
	</p>
{/if}
{#if notice}
	{@render notice()}
{/if}
