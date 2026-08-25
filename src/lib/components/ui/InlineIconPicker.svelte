<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { FA_ICONS, type FaFamily } from '$lib/data/fa-icons';
	import { FA_FAMILY_CLASS, faIconClass, faIconValue, inferFaFamily, parseFaIconValue } from '$lib/utils/fa-icon';
	import { Search, X } from 'lucide-svelte';
	import { onMount } from 'svelte';

	interface Props {
		value: string;
		onchange: (value: string) => void;
	}

	let { value = '', onchange }: Props = $props();

	const FAMILY_TABS: Array<{ value: FaFamily | 'all'; key: string }> = [
		{ value: 'all', key: 'ADMIN_NEXT.FIELDS.ICON_PICKER.FAMILY_ALL' },
		{ value: 's', key: 'ADMIN_NEXT.FIELDS.ICON_PICKER.FAMILY_SOLID' },
		{ value: 'r', key: 'ADMIN_NEXT.FIELDS.ICON_PICKER.FAMILY_REGULAR' },
		{ value: 'b', key: 'ADMIN_NEXT.FIELDS.ICON_PICKER.FAMILY_BRANDS' }
	];

	let open = $state(false);
	let search = $state('');
	let family = $state<FaFamily | 'all'>('all');
	let containerEl = $state<HTMLDivElement | null>(null);

	// "fa-<name>" for solid, "fa-brands fa-<name>" / "fa-regular fa-<name>" for
	// the families that need their own webfont to render.
	const selected = $derived(parseFaIconValue(value));
	const normalized = $derived(selected.name);
	const selectedFamily = $derived(selected.family ?? (normalized ? inferFaFamily(normalized) : null));

	const filteredIcons = $derived.by(() => {
		const pool = family === 'all' ? FA_ICONS : FA_ICONS.filter((icon) => icon.f === family);
		if (!search) return pool.slice(0, 200);
		const q = search.toLowerCase();
		return pool.filter((icon) => icon.n.includes(q) || icon.t.includes(q)).slice(0, 200);
	});

	function familyLabel(value: FaFamily): string {
		const tab = FAMILY_TABS.find((entry) => entry.value === value);
		return tab ? i18n.t(tab.key) : '';
	}

	function select(name: string, iconFamily: FaFamily) {
		onchange(faIconValue(name, iconFamily));
		open = false;
		search = '';
	}

	function clear() {
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

<div class="relative" bind:this={containerEl}>
	<button
		type="button"
		class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-input bg-muted/50 transition-colors hover:bg-accent"
		onclick={() => { open = !open; search = ''; }}
		title={normalized || 'Choose icon'}
	>
		{#if normalized}
			<i class="{faIconClass(value)} text-sm text-foreground"></i>
		{:else}
			<i class="fa-solid fa-icons text-sm text-muted-foreground/40"></i>
		{/if}
	</button>

	{#if open}
		<div class="absolute left-0 top-full z-50 mt-1.5 w-72 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
			<!-- Search -->
			<div class="flex items-center gap-2 border-b border-border px-3 py-2">
				<Search size={14} class="shrink-0 text-muted-foreground" />
				<input
					type="text"
					class="flex-1 border-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
					placeholder={i18n.t('ADMIN_NEXT.INLINE_ICON_PICKER.SEARCH_ICONS')}
					bind:value={search}
					autofocus
				/>
				{#if search}
					<button type="button" class="text-muted-foreground" onclick={() => { search = ''; }}>
						<X size={12} />
					</button>
				{/if}
				{#if normalized}
					<button
						type="button"
						class="rounded px-1.5 py-0.5 text-[0.625rem] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
						onclick={clear}
					>
						Clear
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
			<div class="grid max-h-52 grid-cols-8 gap-0.5 overflow-y-auto p-2">
				{#each filteredIcons as icon (icon.f + icon.n)}
					<button
						type="button"
						class="flex h-8 w-full items-center justify-center rounded-md transition-colors
							{normalized === icon.n && selectedFamily === icon.f
								? 'bg-primary text-primary-foreground'
								: 'text-foreground hover:bg-accent'}"
						title={icon.f === 's' ? icon.n : `${icon.n} (${familyLabel(icon.f)})`}
						onmousedown={(e) => { e.preventDefault(); select(icon.n, icon.f); }}
					>
						<i class="{FA_FAMILY_CLASS[icon.f]} fa-{icon.n} text-xs"></i>
					</button>
				{/each}
				{#if filteredIcons.length === 0}
					<div class="col-span-8 py-3 text-center text-xs text-muted-foreground">
						{i18n.t('ADMIN_NEXT.INLINE_ICON_PICKER.NO_ICONS_FOUND')}
					</div>
				{/if}
			</div>

			{#if filteredIcons.length >= 200}
				<div class="border-t border-border px-3 py-1 text-center text-[0.625rem] text-muted-foreground">
					{i18n.t('ADMIN_NEXT.INLINE_ICON_PICKER.TYPE_TO_NARROW_RESULTS')}
				</div>
			{/if}
		</div>
	{/if}
</div>
