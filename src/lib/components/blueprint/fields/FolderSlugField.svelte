<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { i18n } from '$lib/stores/i18n.svelte';
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

	/** Convert a string to a URL-safe slug */
	function slugify(str: string): string {
		return str
			.toString()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '') // strip diacritics
			.toLowerCase()
			.trim()
			.replace(/[''\u2019]/g, '')       // remove apostrophes
			.replace(/[^a-z0-9\s_-]/g, '')    // remove non-alphanumeric
			.replace(/[\s_]+/g, '-')           // spaces/underscores to hyphens
			.replace(/-+/g, '-')               // collapse multiple hyphens
			.replace(/^-|-$/g, '');            // trim leading/trailing hyphens
	}

	function regenerateFromTitle() {
		const title = getValue('header.title');
		if (typeof title === 'string' && title.trim()) {
			const slug = slugify(title);
			onchange(slug);
			highlight = true;
			setTimeout(() => { highlight = false; }, 600);
		}
	}

	function handleInput(e: Event) {
		let val = (e.target as HTMLInputElement).value;
		// Enforce slug characters as you type
		val = val.toLowerCase().replace(/\s/g, '-').replace(/[^a-z0-9_-]/g, '');
		onchange(val);
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
				<p class="mt-0.5 text-xs text-muted-foreground">{translateLabel(field.help)}</p>
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
		<p class="text-xs text-muted-foreground">{translateLabel(field.description)}</p>
	{/if}
</div>
