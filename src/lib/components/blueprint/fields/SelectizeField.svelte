<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { X } from 'lucide-svelte';

	interface Props {
		field: BlueprintField;
		value: unknown;
		onchange: (value: unknown) => void;
	}

	let { field, value, onchange }: Props = $props();
	const translateLabel = i18n.tMaybe;

	// Parse current value into tags array
	// Selectize fields store as comma-separated string or array
	function parseTags(val: unknown): string[] {
		if (Array.isArray(val)) return val.map(String).filter(Boolean);
		if (typeof val === 'string' && val) return val.split(',').map((s) => s.trim()).filter(Boolean);
		return [];
	}

	// Use derived for the tag display — always reflects the current value prop.
	// Internal edits call onchange() which updates the parent's data, which flows back as value.
	const tags = $derived(parseTags(value));
	let inputValue = $state('');
	let inputEl = $state<HTMLInputElement | null>(null);
	let showSuggestions = $state(false);
	let highlightedIndex = $state(-1);

	// Available options from blueprint (if any) — for autocomplete
	const predefinedOptions = $derived(
		field.options?.map((opt) => opt.value) ?? []
	);

	// Filter suggestions based on input, excluding already-selected tags
	const suggestions = $derived(
		inputValue.length > 0 && predefinedOptions.length > 0
			? predefinedOptions.filter(
					(opt) =>
						opt.toLowerCase().includes(inputValue.toLowerCase()) &&
						!tags.includes(opt)
				)
			: []
	);

	function emitChange(newTags: string[]) {
		// Emit as comma-separated string (matches Grav's commalist validate type)
		if (field.validate?.type === 'commalist') {
			onchange(newTags.join(','));
		} else {
			onchange(newTags);
		}
	}

	function addTag(tag: string) {
		const trimmed = tag.trim();
		if (!trimmed || tags.includes(trimmed)) return;
		emitChange([...tags, trimmed]);
		inputValue = '';
		showSuggestions = false;
		highlightedIndex = -1;
	}

	function removeTag(index: number) {
		emitChange(tags.filter((_, i) => i !== index));
	}

	function removeLastTag() {
		if (tags.length > 0 && !inputValue) {
			emitChange(tags.slice(0, -1));
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === 'Tab' || e.key === ',') {
			e.preventDefault();
			if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
				addTag(suggestions[highlightedIndex]);
			} else if (inputValue.trim()) {
				addTag(inputValue);
			}
		} else if (e.key === 'Backspace') {
			if (!inputValue) {
				removeLastTag();
			}
		} else if (e.key === 'Escape') {
			showSuggestions = false;
			highlightedIndex = -1;
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			if (suggestions.length > 0) {
				highlightedIndex = Math.min(highlightedIndex + 1, suggestions.length - 1);
				showSuggestions = true;
			}
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			highlightedIndex = Math.max(highlightedIndex - 1, -1);
		}
	}

	function handleInput(e: Event) {
		inputValue = (e.target as HTMLInputElement).value;
		showSuggestions = true;
		highlightedIndex = -1;
	}

	function handleFocus() {
		if (inputValue && suggestions.length > 0) {
			showSuggestions = true;
		}
	}

	function handleBlur() {
		// Delay to allow click on suggestion
		setTimeout(() => {
			if (inputValue.trim()) {
				addTag(inputValue);
			}
			showSuggestions = false;
			highlightedIndex = -1;
		}, 150);
	}

	function selectSuggestion(suggestion: string) {
		addTag(suggestion);
		inputEl?.focus();
	}

	function focusInput() {
		inputEl?.focus();
	}
</script>

<div class="space-y-2">
	{#if field.label || field.help}
		<div>
			{#if field.label}
				<label class="text-sm font-semibold text-foreground">
					{translateLabel(field.label)}
				</label>
			{/if}
			{#if field.help}
				<p class="mt-0.5 text-xs text-muted-foreground">{translateLabel(field.help)}</p>
			{/if}
		</div>
	{/if}

	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="relative">
		<div
			class="flex min-h-[40px] flex-wrap items-center gap-1.5 rounded-lg border border-input bg-muted/50 px-2.5 py-1.5 shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring"
			onclick={focusInput}
		>
			{#each tags as tag, i (tag + i)}
				<span class="inline-flex items-center gap-1 rounded-md bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
					{tag}
					<button
						type="button"
						class="inline-flex items-center rounded-sm text-primary/60 transition-colors hover:text-primary"
						onclick={(e) => { e.stopPropagation(); removeTag(i); }}
					>
						<X size={12} />
					</button>
				</span>
			{/each}
			<input
				bind:this={inputEl}
				type="text"
				class="min-w-[80px] flex-1 border-0 bg-transparent py-0.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
				value={inputValue}
				placeholder={tags.length === 0 ? (translateLabel(field.placeholder) || 'Type and press Enter...') : ''}
				oninput={handleInput}
				onkeydown={handleKeydown}
				onfocus={handleFocus}
				onblur={handleBlur}
				disabled={field.disabled}
			/>
		</div>

		<!-- Autocomplete suggestions dropdown -->
		{#if showSuggestions && suggestions.length > 0}
			<div class="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
				<div class="max-h-48 overflow-y-auto p-1">
					{#each suggestions as suggestion, i (suggestion)}
						<button
							type="button"
							class="flex w-full rounded-md px-3 py-1.5 text-left text-sm transition-colors
								{i === highlightedIndex
									? 'bg-accent text-accent-foreground'
									: 'text-foreground hover:bg-accent'}"
							onmousedown={(e) => { e.preventDefault(); selectSuggestion(suggestion); }}
						>
							{suggestion}
						</button>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</div>
