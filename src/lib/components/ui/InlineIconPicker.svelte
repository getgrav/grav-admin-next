<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { FA_ICONS } from '$lib/data/fa-icons';
	import { Search, X } from 'lucide-svelte';
	import { onMount } from 'svelte';

	interface Props {
		value: string;
		onchange: (value: string) => void;
	}

	let { value = '', onchange }: Props = $props();

	let open = $state(false);
	let search = $state('');
	let containerEl = $state<HTMLDivElement | null>(null);

	const normalized = $derived(value.replace(/^fa-/, ''));

	const filteredIcons = $derived.by(() => {
		if (!search) return FA_ICONS.slice(0, 200);
		const q = search.toLowerCase();
		return FA_ICONS.filter(
			(icon) => icon.n.includes(q) || icon.t.includes(q)
		).slice(0, 200);
	});

	function select(name: string) {
		onchange('fa-' + name);
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
			<i class="fa-solid fa-{normalized} text-sm text-foreground"></i>
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
						class="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
						onclick={clear}
					>
						Clear
					</button>
				{/if}
			</div>

			<!-- Icon grid -->
			<div class="grid max-h-52 grid-cols-8 gap-0.5 overflow-y-auto p-2">
				{#each filteredIcons as icon (icon.n)}
					<button
						type="button"
						class="flex h-8 w-full items-center justify-center rounded-md transition-colors
							{normalized === icon.n
								? 'bg-primary text-primary-foreground'
								: 'text-foreground hover:bg-accent'}"
						title={icon.n}
						onmousedown={(e) => { e.preventDefault(); select(icon.n); }}
					>
						<i class="fa-solid fa-{icon.n} text-xs"></i>
					</button>
				{/each}
				{#if filteredIcons.length === 0}
					<div class="col-span-8 py-3 text-center text-xs text-muted-foreground">
						{i18n.t('ADMIN_NEXT.INLINE_ICON_PICKER.NO_ICONS_FOUND')}
					</div>
				{/if}
			</div>

			{#if filteredIcons.length >= 200}
				<div class="border-t border-border px-3 py-1 text-center text-[10px] text-muted-foreground">
					{i18n.t('ADMIN_NEXT.INLINE_ICON_PICKER.TYPE_TO_NARROW_RESULTS')}
				</div>
			{/if}
		</div>
	{/if}
</div>
