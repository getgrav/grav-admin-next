<script lang="ts">
	import { renderMarkdownInline, sanitizeHtml } from '$lib/utils/markdown';
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { slugify, sanitizeSlugInput } from '$lib/utils/slug';
	import { RefreshCw } from 'lucide-svelte';

	interface Props {
		field: BlueprintField;
		value: unknown;
		onchange: (value: unknown) => void;
		getValue: (path: string) => unknown;
	}

	let { field, value, onchange, getValue }: Props = $props();
	const translateLabel = i18n.tMaybe;

	let highlight = $state(false);

	function regenerateFromTitle() {
		const title = getValue('header.title');
		if (typeof title === 'string' && title.trim()) {
			const slug = slugify(title, i18n.lang);
			onchange(slug);
			highlight = true;
			setTimeout(() => { highlight = false; }, 600);
		}
	}

	function handleInput(e: Event) {
		// Enforce slug characters as you type
		onchange(sanitizeSlugInput((e.target as HTMLInputElement).value));
	}
</script>

<div class="space-y-2">
	{#if field.label || field.help}
		<div>
			{#if field.label}
				<label class="text-sm font-semibold text-foreground">
					{translateLabel(field.label)}
					{#if field.validate?.required}
						<span class="text-red-500">*</span>
					{/if}
				</label>
			{/if}
			{#if field.help}
				<p class="mt-0.5 text-xs text-muted-foreground">{@html translateLabel(field.help)}</p>
			{/if}
		</div>
	{/if}

	<div class="flex items-stretch">
		<input
			type="text"
			class="flex h-10 min-w-0 flex-1 rounded-l-lg border border-r-0 border-input bg-muted/50 px-3 py-2 font-mono text-sm shadow-sm transition-all placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring
				{highlight ? 'bg-primary/10 text-primary' : 'text-foreground'}"
			value={value ?? field.default ?? ''}
			placeholder={translateLabel(field.placeholder) || 'folder-name'}
			disabled={field.disabled}
			readonly={field.readonly}
			oninput={handleInput}
		/>
		<button
			type="button"
			class="flex h-10 w-10 shrink-0 items-center justify-center rounded-r-lg border border-input bg-muted/50 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
			onclick={regenerateFromTitle}
			title={i18n.t('ADMIN_NEXT.FIELDS.REGENERATE_SLUG')}
		>
			<RefreshCw size={14} class={highlight ? 'animate-spin' : ''} />
		</button>
	</div>

	{#if field.description}
		{@const desc = translateLabel(field.description)}
		{#if field.markdown}
			<p class="text-xs text-muted-foreground">{@html renderMarkdownInline(desc)}</p>
		{:else}
			<p class="text-xs text-muted-foreground">{@html sanitizeHtml(desc)}</p>
		{/if}
	{/if}
</div>
