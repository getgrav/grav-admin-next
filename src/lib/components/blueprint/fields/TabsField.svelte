<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import FieldRenderer from '../FieldRenderer.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { fieldMatches } from '$lib/utils/field-filter';

	interface Props {
		field: BlueprintField;
		getValue: (path: string) => unknown;
		onFieldChange: (path: string, value: unknown) => void;
		filter?: string;
	}

	let { field, getValue, onFieldChange, filter = '' }: Props = $props();
	const translateLabel = i18n.tMaybe;

	const tabs = $derived((field.fields ?? []).filter((f) => f.type === 'tab' || f.fields));
	const isSideTabs = $derived(field.classes?.includes('side-tabs') ?? false);

	const tabHasMatch = $derived(
		filter
			? new Set(tabs.filter(tab => tab.fields?.some(f => fieldMatches(f, filter))).map(t => t.name))
			: null
	);
	const noResults = $derived(!!filter && !!tabHasMatch && tabHasMatch.size === 0);

	// When filter changes, snap to first matching tab if current tab has no matches
	$effect(() => {
		if (tabHasMatch && tabHasMatch.size > 0) {
			const currentTab = tabs[activeIndex];
			if (!currentTab || !tabHasMatch.has(currentTab.name)) {
				const firstMatch = tabs.findIndex(t => tabHasMatch.has(t.name));
				if (firstMatch >= 0) activeIndex = firstMatch;
			}
		}
	});

	// Check if this is a nested tab (URL already has a hash from a parent tab context)
	function getHashParts(): string[] {
		if (typeof window === 'undefined') return [];
		return window.location.hash.slice(1).split('--').map(s => s.toLowerCase());
	}

	// Resolve initial tab from URL hash (supports nested hashes like #scheduler--jobs_tab)
	function getInitialIndex(): number {
		const hashParts = getHashParts();
		if (hashParts.length === 0) return 0;
		// Try matching the last segment, then any segment
		for (const part of [...hashParts].reverse()) {
			const idx = tabs.findIndex((t) => t.name.toLowerCase() === part);
			if (idx >= 0) return idx;
		}
		return 0;
	}

	let activeIndex = $state(getInitialIndex());
	const tabKey = $derived(tabs.map((t) => t.name).join(','));
	let prevTabKey = $state(tabKey);

	// Only re-resolve activeIndex when the tabs actually change (blueprint reload)
	$effect(() => {
		if (tabKey === prevTabKey) return;
		prevTabKey = tabKey;
		if (tabs.length === 0) return;
		activeIndex = getInitialIndex();
	});

	function setActiveTab(index: number) {
		activeIndex = index;
		const tab = tabs[index];
		if (tab) {
			// Preserve parent hash segments, replace/append this level
			const hashParts = getHashParts();
			const tabName = tab.name.toLowerCase();
			// Check if any existing part matches a tab in this group
			const myTabNames = new Set(tabs.map(t => t.name.toLowerCase()));
			const parentParts = hashParts.filter(p => !myTabNames.has(p));
			const newHash = [...parentParts, tabName].join('--');
			history.replaceState(null, '', `#${newHash}`);
		}
	}

	// Listen for hash changes (browser back/forward)
	$effect(() => {
		function onHashChange() {
			const hashParts = getHashParts();
			for (const part of [...hashParts].reverse()) {
				const idx = tabs.findIndex((t) => t.name.toLowerCase() === part);
				if (idx >= 0 && idx !== activeIndex) {
					activeIndex = idx;
					return;
				}
			}
		}
		window.addEventListener('hashchange', onHashChange);
		return () => window.removeEventListener('hashchange', onHashChange);
	});
</script>

{#if isSideTabs}
	<!-- Side tabs: vertical nav on left, content on right (large screens) -->
	<div class="flex flex-col lg:flex-row lg:gap-0">
		<!-- Vertical tab list (horizontal on small, sticky on large) -->
		<div class="shrink-0 border-b border-border lg:w-52 lg:self-start lg:sticky lg:top-0 lg:border-b-0 lg:border-r">
			<nav class="flex gap-1 overflow-x-auto p-1 lg:flex-col lg:overflow-x-visible lg:p-2">
				{#each tabs as tab, i (tab.name)}
					{@const hasMatch = !tabHasMatch || tabHasMatch.has(tab.name)}
					{#if !filter || hasMatch}
						<button
							class="whitespace-nowrap rounded-md px-3 py-2 text-left text-sm font-medium transition-colors
								{i === activeIndex
									? 'bg-primary/10 text-primary'
									: 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}"
							onclick={() => setActiveTab(i)}
						>
							{translateLabel(tab.title || tab.label || tab.name)}
						</button>
					{/if}
				{/each}
			</nav>
		</div>

		<!-- Active tab content -->
		<div class="min-w-0 flex-1 p-4 lg:pl-6">
			{#if noResults}
				<div class="py-12 text-center text-sm text-muted-foreground">No fields match your filter</div>
			{:else}
				{#each tabs as tab, i (tab.name)}
					{#if tab.fields}
						<div class="space-y-4" class:hidden={i !== activeIndex}>
							{#each tab.fields as childField (childField.name)}
								<FieldRenderer
									field={childField}
									value={getValue(childField.name)}
									onchange={(val) => onFieldChange(childField.name, val)}
									{getValue}
									{onFieldChange}
									{filter}
								/>
							{/each}
						</div>
					{/if}
				{/each}
			{/if}
		</div>
	</div>
{:else}
	<!-- Standard horizontal tabs -->
	<div>
		<div class="flex gap-1 border-b border-border">
			{#each tabs as tab, i (tab.name)}
				{@const hasMatch = !tabHasMatch || tabHasMatch.has(tab.name)}
				{#if !filter || hasMatch}
					<button
						class="border-b-2 px-4 py-2 text-sm font-medium transition-colors
							{i === activeIndex
								? 'border-primary text-primary'
								: 'border-transparent text-muted-foreground hover:text-foreground'}"
						onclick={() => setActiveTab(i)}
					>
						{translateLabel(tab.title || tab.label || tab.name)}
					</button>
				{/if}
			{/each}
		</div>

		{#if noResults}
			<div class="py-12 text-center text-sm text-muted-foreground">No fields match your filter</div>
		{:else}
			{#each tabs as tab, i (tab.name)}
				{#if tab.fields}
					<div class="space-y-4 pt-4" class:hidden={i !== activeIndex}>
						{#each tab.fields as childField (childField.name)}
							<FieldRenderer
								field={childField}
								value={getValue(childField.name)}
								onchange={(val) => onFieldChange(childField.name, val)}
								{getValue}
								{onFieldChange}
								{filter}
							/>
						{/each}
					</div>
				{/if}
			{/each}
		{/if}
	</div>
{/if}
