<script lang="ts">
	/**
	 * Editor for a `pages` media metadata field: the picked page routes as chips,
	 * and a search box that finds pages across the whole site (the same search
	 * the page pickers use) and adds the one you pick. Stores public routes
	 * (`page.route`), so a template can test `page.route in meta.pages`.
	 */
	import { i18n } from '$lib/stores/i18n.svelte';
	import { createPageSearch } from '$lib/utils/page-search.svelte';
	import { isAncestorOnly, type PageSummary } from '$lib/api/endpoints/pages';
	import { File, Loader2, X } from 'lucide-svelte';

	interface Props {
		id: string;
		value: string[];
		disabled?: boolean;
		readonly?: boolean;
		required?: boolean;
		onchange: (routes: string[]) => void;
	}

	let { id, value, disabled = false, readonly = false, required = false, onchange }: Props = $props();

	let query = $state('');
	let open = $state(false);
	let active = $state(0);
	let rootEl = $state<HTMLDivElement | null>(null);
	// Titles of pages picked in this session, for the chips' tooltips.
	let titles = $state<Record<string, string>>({});

	const search = createPageSearch({ debounceMs: 200, editable: false, limit: 20 });
	const results = $derived(
		search.results.filter((p) => !isAncestorOnly(p) && !value.includes(p.route))
	);

	$effect(() => {
		search.run(query);
	});
	$effect(() => () => search.dispose());

	$effect(() => {
		if (!open) return;
		const close = (e: MouseEvent) => {
			if (rootEl && !rootEl.contains(e.target as Node)) open = false;
		};
		document.addEventListener('mousedown', close);
		return () => document.removeEventListener('mousedown', close);
	});

	function add(page: PageSummary) {
		titles[page.route] = page.title;
		if (!value.includes(page.route)) onchange([...value, page.route]);
		query = '';
		active = 0;
	}

	function remove(index: number) {
		onchange(value.filter((_, i) => i !== index));
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			open = true;
			active = Math.min(active + 1, Math.max(results.length - 1, 0));
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			active = Math.max(active - 1, 0);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			const page = results[active];
			if (page) add(page);
		} else if (e.key === 'Escape') {
			if (open || query) {
				e.stopPropagation();
				open = false;
				query = '';
			}
		} else if (e.key === 'Backspace' && !query && value.length) {
			remove(value.length - 1);
		}
	}
</script>

<div class="relative mt-1" bind:this={rootEl}>
	<div
		class="flex flex-wrap items-center gap-1 rounded-md border border-input bg-transparent px-1.5 py-1 focus-within:ring-1 focus-within:ring-ring {disabled || readonly
			? 'opacity-60'
			: ''}"
	>
		{#each value as route, i (route)}
			<span
				class="inline-flex max-w-full items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground"
				title={titles[route]}
			>
				<span class="truncate">{route}</span>
				{#if !readonly}
					<button
						type="button"
						class="text-muted-foreground hover:text-foreground"
						onclick={() => remove(i)}
						aria-label={i18n.t('ADMIN_NEXT.DELETE')}
						{disabled}
					>
						<X size={11} />
					</button>
				{/if}
			</span>
		{/each}
		{#if !readonly}
			<input
				{id}
				type="text"
				role="combobox"
				aria-expanded={open && query.trim() !== ''}
				aria-controls={`${id}-results`}
				aria-required={required ? 'true' : undefined}
				autocomplete="off"
				class="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm focus:outline-none disabled:opacity-60"
				placeholder={i18n.t('ADMIN_NEXT.MEDIA.METADATA.PAGES_PLACEHOLDER')}
				{disabled}
				bind:value={query}
				oninput={() => {
					open = true;
					active = 0;
				}}
				onfocus={() => (open = true)}
				onkeydown={handleKeydown}
			/>
		{/if}
	</div>

	{#if open && query.trim() !== ''}
		<div
			id={`${id}-results`}
			role="listbox"
			class="absolute start-0 end-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
		>
			{#if search.loading}
				<div class="flex items-center justify-center py-4 text-sm text-muted-foreground">
					<Loader2 size={14} class="me-2 animate-spin" />
					{i18n.t('ADMIN_NEXT.PAGES.PAGES_TREE_VIEW.SEARCHING')}
				</div>
			{:else if results.length === 0}
				<div class="py-3 text-center text-sm text-muted-foreground">
					{i18n.t('ADMIN_NEXT.PAGES.NO_PAGES')}
				</div>
			{:else}
				{#each results as page, i (page.route)}
					<button
						type="button"
						role="option"
						aria-selected={i === active}
						class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm transition-colors {i ===
						active
							? 'bg-accent'
							: 'hover:bg-accent'}"
						onmouseenter={() => (active = i)}
						onclick={() => add(page)}
					>
						<File size={14} class="shrink-0 text-muted-foreground" />
						<span class="min-w-0 truncate">
							{page.title}
							<span class="text-muted-foreground">{page.route}</span>
						</span>
					</button>
				{/each}
			{/if}
		</div>
	{/if}
</div>
