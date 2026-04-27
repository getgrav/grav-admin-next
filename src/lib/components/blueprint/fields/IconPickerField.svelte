<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { FA_ICONS } from '$lib/data/fa-icons';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { X, ChevronDown, Search } from 'lucide-svelte';
	import { onMount, onDestroy } from 'svelte';

	interface Props {
		field: BlueprintField;
		value: unknown;
		onchange: (value: unknown) => void;
	}

	let { field, value, onchange }: Props = $props();
	const translateLabel = i18n.tMaybe;

	let open = $state(false);
	let search = $state('');
	let containerEl = $state<HTMLDivElement | null>(null);
	let gridEl = $state<HTMLDivElement | null>(null);

	const currentValue = $derived(typeof value === 'string' ? value : '');

	// Strip fa- prefix for display/matching, add it back for storage
	const normalizedValue = $derived(currentValue.replace(/^fa-/, ''));

	const filteredIcons = $derived.by(() => {
		if (!search) return FA_ICONS.slice(0, 200); // Show first 200 on open
		const q = search.toLowerCase();
		return FA_ICONS.filter(
			(icon) => icon.n.includes(q) || icon.t.includes(q)
		).slice(0, 200);
	});

	function selectIcon(name: string) {
		// Store with fa- prefix to match Grav convention
		onchange('fa-' + name);
		open = false;
		search = '';
	}

	function clearValue() {
		onchange('');
	}

	function handleClickOutside(e: MouseEvent) {
		if (containerEl && !containerEl.contains(e.target as Node)) {
			open = false;
		}
	}

	onMount(() => {
		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	});
</script>

<div class="space-y-2">
	{#if field.label || field.help}
		<div>
			{#if field.label}
				<label class="text-sm font-semibold text-foreground">{translateLabel(field.label)}</label>
			{/if}
			{#if field.help}
				<p class="mt-0.5 text-xs text-muted-foreground">{translateLabel(field.help)}</p>
			{/if}
		</div>
	{/if}

	<div class="relative" bind:this={containerEl}>
		<!-- Selected value -->
		<div class="flex min-h-[40px] items-center rounded-lg border border-input bg-muted/50 shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring">
			{#if currentValue && !open}
				<div class="flex flex-1 items-center gap-2.5 px-3">
					<i class="fa-solid fa-{normalizedValue} text-base text-foreground"></i>
					<span class="text-sm text-foreground">fa-{normalizedValue}</span>
				</div>
				<button
					type="button"
					class="shrink-0 px-2 text-muted-foreground transition-colors hover:text-foreground"
					onclick={clearValue}
				>
					<X size={14} />
				</button>
			{:else}
				<button
					type="button"
					class="flex h-10 flex-1 items-center px-3 text-sm text-muted-foreground"
					onclick={() => { open = !open; }}
				>
					{currentValue ? `fa-${normalizedValue}` : 'Select an icon...'}
				</button>
			{/if}
			<button
				type="button"
				class="shrink-0 px-2 text-muted-foreground"
				onclick={() => { open = !open; }}
				tabindex={-1}
			>
				<ChevronDown size={14} />
			</button>
		</div>

		<!-- Dropdown -->
		{#if open}
			<div class="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
				<!-- Search -->
				<div class="flex items-center gap-2 border-b border-border px-3 py-2">
					<Search size={14} class="shrink-0 text-muted-foreground" />
					<input
						type="text"
						class="flex-1 border-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
						placeholder={i18n.t('ADMIN_NEXT.FIELDS.ICON_PICKER.SEARCH_ICONS')}
						value={search}
						oninput={(e) => { search = (e.target as HTMLInputElement).value; }}
						autofocus
					/>
					{#if search}
						<button type="button" class="text-muted-foreground" onclick={() => { search = ''; }}>
							<X size={12} />
						</button>
					{/if}
				</div>

				<!-- Icon grid -->
				<div bind:this={gridEl} class="grid max-h-64 grid-cols-8 gap-0.5 overflow-y-auto p-2">
					{#each filteredIcons as icon (icon.n)}
						<button
							type="button"
							class="flex h-9 w-full items-center justify-center rounded-md transition-colors
								{normalizedValue === icon.n
									? 'bg-primary text-primary-foreground'
									: 'text-foreground hover:bg-accent'}"
							title={icon.n}
							onmousedown={(e) => { e.preventDefault(); selectIcon(icon.n); }}
						>
							<i class="fa-solid fa-{icon.n} text-sm"></i>
						</button>
					{/each}
					{#if filteredIcons.length === 0}
						<div class="col-span-8 py-4 text-center text-sm text-muted-foreground">
							{i18n.t('ADMIN_NEXT.FIELDS.ICON_PICKER.NO_ICONS_FOUND')}
						</div>
					{/if}
				</div>

				{#if filteredIcons.length >= 200}
					<div class="border-t border-border px-3 py-1.5 text-center text-[10px] text-muted-foreground">
						{i18n.t('ADMIN_NEXT.FIELDS.ICON_PICKER.SHOWING_FIRST_200_RESULTS_TYPE_TO_NARROW')}
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>
