<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { FA_ICONS, type FaFamily } from '$lib/data/fa-icons';
	import { FA_FAMILY_CLASS, faIconClass, faIconValue, inferFaFamily, parseFaIconValue } from '$lib/utils/fa-icon';
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

	const FAMILY_TABS: Array<{ value: FaFamily | 'all'; key: string }> = [
		{ value: 'all', key: 'ADMIN_NEXT.FIELDS.ICON_PICKER.FAMILY_ALL' },
		{ value: 's', key: 'ADMIN_NEXT.FIELDS.ICON_PICKER.FAMILY_SOLID' },
		{ value: 'r', key: 'ADMIN_NEXT.FIELDS.ICON_PICKER.FAMILY_REGULAR' },
		{ value: 'b', key: 'ADMIN_NEXT.FIELDS.ICON_PICKER.FAMILY_BRANDS' }
	];

	function familyLabel(value: FaFamily): string {
		const tab = FAMILY_TABS.find((entry) => entry.value === value);
		return tab ? i18n.t(tab.key) : '';
	}

	let open = $state(false);
	let search = $state('');
	let family = $state<FaFamily | 'all'>('all');
	let containerEl = $state<HTMLDivElement | null>(null);
	let gridEl = $state<HTMLDivElement | null>(null);

	const currentValue = $derived(typeof value === 'string' ? value : '');

	// Values are stored as "fa-<name>" for solid and "fa-brands fa-<name>" /
	// "fa-regular fa-<name>" for the other families, which is what a theme needs
	// to render them. Brand names are unique, so a family-less legacy value
	// still resolves to the right font.
	const selected = $derived(parseFaIconValue(currentValue));
	const selectedName = $derived(selected.name);
	const selectedFamily = $derived(selected.family ?? (selectedName ? inferFaFamily(selectedName) : null));

	const filteredIcons = $derived.by(() => {
		const pool = family === 'all' ? FA_ICONS : FA_ICONS.filter((icon) => icon.f === family);
		if (!search) return pool.slice(0, 200); // Show first 200 on open
		const q = search.toLowerCase();
		return pool.filter((icon) => icon.n.includes(q) || icon.t.includes(q)).slice(0, 200);
	});

	function selectIcon(name: string, iconFamily: FaFamily) {
		onchange(faIconValue(name, iconFamily));
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
				<p class="mt-0.5 text-xs text-muted-foreground">{@html translateLabel(field.help)}</p>
			{/if}
		</div>
	{/if}

	<div class="relative" bind:this={containerEl}>
		<!-- Selected value -->
		<div class="flex min-h-[40px] items-center rounded-lg border border-input bg-muted/50 shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring">
			{#if currentValue && !open}
				<div class="flex flex-1 items-center gap-2.5 px-3">
					<i class="{faIconClass(currentValue)} text-base text-foreground"></i>
					<span class="text-sm text-foreground">{currentValue}</span>
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
					{currentValue || i18n.t('ADMIN_NEXT.FIELDS.SELECT_AN_ICON')}
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

				<!-- Family filter -->
				<div class="flex items-center gap-1 border-b border-border px-2 py-1.5">
					{#each FAMILY_TABS as tab (tab.value)}
						<button
							type="button"
							class="rounded-md px-2 py-0.5 text-[0.6875rem] transition-colors
								{family === tab.value
									? 'bg-primary text-primary-foreground'
									: 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
							onmousedown={(e) => { e.preventDefault(); family = tab.value; }}
						>
							{i18n.t(tab.key)}
						</button>
					{/each}
				</div>

				<!-- Icon grid -->
				<div bind:this={gridEl} class="grid max-h-64 grid-cols-8 gap-0.5 overflow-y-auto p-2">
					{#each filteredIcons as icon (icon.f + icon.n)}
						<button
							type="button"
							class="flex h-9 w-full items-center justify-center rounded-md transition-colors
								{selectedName === icon.n && selectedFamily === icon.f
									? 'bg-primary text-primary-foreground'
									: 'text-foreground hover:bg-accent'}"
							title={icon.f === 's' ? icon.n : `${icon.n} (${familyLabel(icon.f)})`}
							onmousedown={(e) => { e.preventDefault(); selectIcon(icon.n, icon.f); }}
						>
							<i class="{FA_FAMILY_CLASS[icon.f]} fa-{icon.n} text-sm"></i>
						</button>
					{/each}
					{#if filteredIcons.length === 0}
						<div class="col-span-8 py-4 text-center text-sm text-muted-foreground">
							{i18n.t('ADMIN_NEXT.FIELDS.ICON_PICKER.NO_ICONS_FOUND')}
						</div>
					{/if}
				</div>

				{#if filteredIcons.length >= 200}
					<div class="border-t border-border px-3 py-1.5 text-center text-[0.625rem] text-muted-foreground">
						{i18n.t('ADMIN_NEXT.FIELDS.ICON_PICKER.SHOWING_FIRST_200_RESULTS_TYPE_TO_NARROW')}
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>
