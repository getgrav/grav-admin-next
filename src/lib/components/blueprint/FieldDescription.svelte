<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { renderMarkdownInline } from '$lib/utils/markdown';
	import { i18n } from '$lib/stores/i18n.svelte';

	/**
	 * The `description` line rendered under a field's input.
	 *
	 * Only a handful of field components ever read `description` themselves, so
	 * it rendered for some types and silently vanished for the rest. Owning it in
	 * the shared field chrome makes it work for every type at once
	 * (grav-admin-next#18).
	 */
	interface Props {
		field: BlueprintField;
	}

	let { field }: Props = $props();

	const description = $derived(i18n.tMaybe(field.description));
</script>

{#if description}
	<p class="mt-2 text-xs text-muted-foreground">
		{#if field.markdown}{@html renderMarkdownInline(description)}{:else}{description}{/if}
	</p>
{/if}
