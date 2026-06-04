<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { ChevronDown, Search, X, Check, Loader2 } from 'lucide-svelte';
	import type { Snippet } from 'svelte';

	export interface FilterOption {
		value: string;
		label: string;
		/** Secondary muted text shown after the label (e.g. the raw permission key). */
		hint?: string;
	}

	interface Props {
		label: string;
		options: FilterOption[];
		value?: string | null;
		/** Optional leading icon, rendered as a snippet (e.g. a lucide icon). */
		icon?: Snippet;
		loading?: boolean;
		placeholder?: string;
		/** Pin the popover to the end (right in LTR) instead of the start. */
		align?: 'start' | 'end';
		onchange?: (value: string | null) => void;
	}

	let {
		label,
		options,
		value = $bindable(null),
		icon,
		loading = false,
		placeholder,
		align = 'start',
		onchange,
	}: Props = $props();

	let open = $state(false);
	let query = $state('');
	let inputEl = $state<HTMLInputElement | null>(null);

	const selected = $derived(value ? options.find((o) => o.value === value) ?? null : null);

	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return options;
		return options.filter(
			(o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
		);
	});

	function toggle() {
		open = !open;
		if (open) {
			query = '';
			// Focus the search box once the popover is in the DOM.
			queueMicrotask(() => inputEl?.focus());
		}
	}

	function pick(option: FilterOption) {
		value = option.value;
		onchange?.(option.value);
		open = false;
	}

	function clear(e: MouseEvent) {
		e.stopPropagation();
		value = null;
		onchange?.(null);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			open = false;
		}
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="relative" onkeydown={handleKeydown}>
	<button
		type="button"
		class="inline-flex h-8 max-w-[14rem] items-center gap-1.5 rounded-md border px-2.5 text-[0.75rem] font-medium transition-colors
			{selected
				? 'border-primary/50 bg-primary/10 text-foreground'
				: open
					? 'border-border bg-accent text-accent-foreground'
					: 'border-border text-muted-foreground hover:bg-accent/50 hover:text-foreground'}"
		onclick={toggle}
		title={label}
	>
		{#if icon}<span class="inline-flex shrink-0">{@render icon()}</span>{/if}
		<span class="truncate">{selected ? selected.label : label}</span>
		{#if selected}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<span
				class="-me-1 ms-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-background/60 hover:text-foreground"
				onclick={clear}
				role="button"
				tabindex="-1"
				aria-label={i18n.t('ADMIN_NEXT.USERS_FILTER.CLEAR')}
			>
				<X size={12} />
			</span>
		{:else}
			<ChevronDown size={12} class="ms-0.5 shrink-0 transition-transform {open ? 'rotate-180' : ''}" />
		{/if}
	</button>

	{#if open}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="fixed inset-0 z-40" onclick={() => (open = false)}></div>
		<div
			class="absolute z-50 mt-1 w-64 rounded-md border border-border bg-popover shadow-md {align === 'end' ? 'end-0' : 'start-0'}"
		>
			<div class="relative border-b border-border p-2">
				<Search size={13} class="absolute start-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
				<input
					bind:this={inputEl}
					bind:value={query}
					type="text"
					class="h-7 w-full rounded border border-input bg-muted/50 ps-7 pe-2 text-[0.8125rem] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
					placeholder={placeholder ?? i18n.t('ADMIN_NEXT.USERS_FILTER.TYPE_TO_FILTER')}
				/>
			</div>

			<div class="max-h-64 overflow-y-auto py-1">
				{#if loading}
					<div class="flex items-center justify-center gap-2 px-3 py-4 text-xs text-muted-foreground">
						<Loader2 size={13} class="animate-spin" />
						{i18n.t('ADMIN_NEXT.USERS_FILTER.LOADING')}
					</div>
				{:else if filtered.length === 0}
					<div class="px-3 py-4 text-center text-xs text-muted-foreground">
						{i18n.t('ADMIN_NEXT.USERS_FILTER.NO_MATCHES')}
					</div>
				{:else}
					{#each filtered as option (option.value)}
						<button
							type="button"
							class="flex w-full items-center gap-2 px-3 py-1.5 text-start text-[0.8125rem] transition-colors
								{option.value === value
									? 'bg-accent font-medium text-accent-foreground'
									: 'text-popover-foreground hover:bg-accent/50'}"
							onclick={() => pick(option)}
						>
							<span class="min-w-0 flex-1 truncate">{option.label}</span>
							{#if option.hint && option.hint !== option.label}
								<span class="shrink-0 truncate font-mono text-[0.6875rem] text-muted-foreground">{option.hint}</span>
							{/if}
							{#if option.value === value}
								<Check size={13} class="shrink-0 text-primary" />
							{/if}
						</button>
					{/each}
				{/if}
			</div>
		</div>
	{/if}
</div>
