<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { renderMarkdownInline, sanitizeHtml } from '$lib/utils/markdown';
	import { i18n } from '$lib/stores/i18n.svelte';

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
	 */
	interface Props {
		field: BlueprintField;
	}

	let { field }: Props = $props();

	const description = $derived(i18n.tMaybe(field.description));
</script>

{#if description}
	<p class="mt-2 text-xs text-muted-foreground">
		{#if field.markdown}{@html renderMarkdownInline(description)}{:else}{@html sanitizeHtml(description)}{/if}
	</p>
{/if}
