<script lang="ts">
	import { renderMarkdown, sanitizeHtml } from '$lib/utils/markdown';
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { i18n } from '$lib/stores/i18n.svelte';

	interface Props {
		field: BlueprintField;
	}

	let { field }: Props = $props();
	const translateLabel = i18n.tMaybe;

	// A spacer renders an optional title, optional body text (markdown-aware to
	// match the classic form field), and an optional underline. Grav's classic
	// spacer keeps its text in `text`; older blueprints occasionally use
	// `content`, so honour both.
	const text = $derived(translateLabel(field.text || field.content || ''));
	const hasContent = $derived(!!field.title || !!text);
	// Show the rule when explicitly asked for, or — preserving prior behaviour —
	// when the spacer is otherwise empty and hasn't opted out.
	const showUnderline = $derived(field.underline === true || (!hasContent && field.underline !== false));
</script>

{#if hasContent}
	<div class="mt-2">
		{#if field.title}
			<h4 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				{translateLabel(field.title)}
			</h4>
		{/if}
		{#if text}
			<div class="text-sm text-muted-foreground {field.title ? 'mt-1' : ''}">
				{#if field.markdown}
					{@html renderMarkdown(text)}
				{:else}
					{@html sanitizeHtml(text)}
				{/if}
			</div>
		{/if}
	</div>
{/if}

{#if showUnderline}
	<hr class="border-border {hasContent ? 'mt-2' : ''}" />
{/if}
