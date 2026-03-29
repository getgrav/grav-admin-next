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

	function parseTags(val: unknown): string[] {
		if (Array.isArray(val)) return val.map(String).filter(Boolean);
		if (typeof val === 'string' && val) return val.split(',').map((s) => s.trim()).filter(Boolean);
		return [];
	}

	const tags = $derived(parseTags(value));
	let inputValue = $state('');
	let inputEl = $state<HTMLInputElement | null>(null);
	let showSuggestions = $state(false);
	let highlightedIndex = $state(-1);
	let selectedTagIndex = $state(-1);

	const predefinedOptions = $derived(
		field.options?.map((opt) => opt.value) ?? []
	);

	// Show filtered suggestions when typing, or ALL unselected options on focus
	const suggestions = $derived.by(() => {
		if (!showSuggestions) return [];
		const available = predefinedOptions.filter((opt) => !tags.includes(opt));
		if (inputValue.length > 0) {
			return available.filter((opt) =>
				opt.toLowerCase().includes(inputValue.toLowerCase())
			);
		}
		return available;
	});

	function emitChange(newTags: string[]) {
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
		highlightedIndex = -1;
		selectedTagIndex = -1;
		// Keep suggestions open if there are predefined options
		showSuggestions = predefinedOptions.length > 0;
	}

	function removeTag(index: number) {
		emitChange(tags.filter((_, i) => i !== index));
		selectedTagIndex = -1;
		inputEl?.focus();
	}

	function handleKeydown(e: KeyboardEvent) {
		// If a tag is selected via arrow keys
		if (selectedTagIndex >= 0) {
			if (e.key === 'Backspace' || e.key === 'Delete') {
				e.preventDefault();
				const idx = selectedTagIndex;
				const newIdx = idx > 0 ? idx - 1 : tags.length > 1 ? 0 : -1;
				removeTag(idx);
				selectedTagIndex = newIdx;
				return;
			}
			if (e.key === 'ArrowLeft') {
				e.preventDefault();
				selectedTagIndex = Math.max(0, selectedTagIndex - 1);
				return;
			}
			if (e.key === 'ArrowRight') {
				e.preventDefault();
				if (selectedTagIndex < tags.length - 1) {
					selectedTagIndex++;
				} else {
					selectedTagIndex = -1;
					inputEl?.focus();
				}
				return;
			}
			if (e.key === 'Escape') {
				selectedTagIndex = -1;
				inputEl?.focus();
				return;
			}
			// Any other key — deselect tag and let input handle it
			selectedTagIndex = -1;
			return;
		}

		if (e.key === 'Enter' || e.key === 'Tab' || e.key === ',') {
			if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
				e.preventDefault();
				addTag(suggestions[highlightedIndex]);
			} else if (inputValue.trim()) {
				e.preventDefault();
				addTag(inputValue);
			} else if (e.key === 'Enter' && suggestions.length > 0 && !inputValue) {
				// Don't prevent tab default when no input
			}
		} else if (e.key === 'Backspace') {
			if (!inputValue && tags.length > 0) {
				e.preventDefault();
				selectedTagIndex = tags.length - 1;
			}
		} else if (e.key === 'ArrowLeft') {
			if (!inputValue && tags.length > 0) {
				e.preventDefault();
				selectedTagIndex = tags.length - 1;
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
		selectedTagIndex = -1;
	}

	function handleFocus() {
		showSuggestions = true;
		selectedTagIndex = -1;
	}

	function handleBlur() {
		setTimeout(() => {
			if (inputValue.trim()) {
				addTag(inputValue);
			}
			showSuggestions = false;
			highlightedIndex = -1;
			selectedTagIndex = -1;
		}, 150);
	}

	function selectSuggestion(suggestion: string) {
		addTag(suggestion);
		inputEl?.focus();
	}

	function focusInput() {
		selectedTagIndex = -1;
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
				<span
					class="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition-colors
						{selectedTagIndex === i
							? 'bg-primary text-primary-foreground ring-1 ring-primary'
							: 'bg-primary/15 text-primary'}"
				>
					{tag}
					<button
						type="button"
						class="inline-flex items-center rounded-sm transition-colors
							{selectedTagIndex === i ? 'text-primary-foreground/70 hover:text-primary-foreground' : 'text-primary/60 hover:text-primary'}"
						onclick={(e) => { e.stopPropagation(); removeTag(i); }}
						tabindex={-1}
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
