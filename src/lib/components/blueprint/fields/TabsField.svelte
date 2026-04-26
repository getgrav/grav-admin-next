<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { replaceState } from '$app/navigation';
	import FieldRenderer from '../FieldRenderer.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { fieldMatches } from '$lib/utils/field-filter';
	import { dragScroll } from '$lib/utils/dragScroll';

	interface Props {
		field: BlueprintField;
		getValue: (path: string) => unknown;
		onFieldChange: (path: string, value: unknown) => void;
		onFieldCommit?: (path: string, value: unknown, oldValue?: unknown) => void;
		filter?: string;
	}

	let { field, getValue, onFieldChange, onFieldCommit, filter = '' }: Props = $props();
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

	// Track the tab strip's height so descendants that pin themselves below
	// the page header (editor toolbar, nested sticky bars) can stack below the
	// tabs as well. We re-set --sticky-header-height on the content wrapper
	// to "inherited value + tabs", so any sticky descendant uses the
	// cumulative offset without knowing about the tab strip specifically.
	// Done in JS because CSS would reject `--x: calc(var(--x) + N)` as a
	// self-referential cycle and resolve it to the guaranteed-invalid value.
	let tabStripEl = $state<HTMLDivElement | undefined>();
	let contentWrapEl = $state<HTMLDivElement | undefined>();
	$effect(() => {
		if (!tabStripEl || !contentWrapEl) return;
		const apply = () => {
			const inherited = parseFloat(
				getComputedStyle(contentWrapEl!.parentElement!).getPropertyValue('--sticky-header-height')
			) || 0;
			const tabsH = tabStripEl!.getBoundingClientRect().height;
			contentWrapEl!.style.setProperty('--sticky-header-height-base', inherited + 'px');
			contentWrapEl!.style.setProperty('--sticky-header-height', (inherited + tabsH) + 'px');
		};
		const ro = new ResizeObserver(apply);
		ro.observe(tabStripEl);

		// Re-apply when the inherited --sticky-header-height changes.
		// The page-edit's StickyHeader animates between expanded/compact
		// states, which mutates the inline style on an ancestor element
		// (`style="--sticky-header-height: 81px;"` → `49px`). That's an
		// attribute mutation, not a size change, so a ResizeObserver
		// wouldn't catch it — use a MutationObserver on the nearest
		// ancestor that defines the property inline.
		let host: HTMLElement | null = contentWrapEl.parentElement;
		while (host && !host.style.getPropertyValue('--sticky-header-height')) host = host.parentElement;
		const mo = host
			? new MutationObserver(apply)
			: null;
		if (host && mo) mo.observe(host, { attributes: true, attributeFilter: ['style'] });

		apply();
		return () => { ro.disconnect(); mo?.disconnect(); };
	});

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
			replaceState(`#${newHash}`, {});
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
		<div class="shrink-0 border-b border-border lg:w-52 lg:self-start lg:sticky lg:border-b-0 lg:border-r" style="top: var(--sticky-header-height, 0px)">
			<nav
				class="flex gap-1 overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:flex-col lg:overflow-x-visible lg:p-2"
				use:dragScroll
			>
				{#each tabs as tab, i (tab.name)}
					{@const hasMatch = !tabHasMatch || tabHasMatch.has(tab.name)}
					{#if !filter || hasMatch}
						<button
							class="shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-left text-sm font-medium transition-colors
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
		<div class="min-w-0 flex-1 py-4 lg:p-4 lg:pl-6">
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
									oncommit={onFieldCommit ? (val: unknown, old?: unknown) => onFieldCommit(childField.name, val, old) : undefined}
									{getValue}
									{onFieldChange}
									{onFieldCommit}
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
	<!-- Standard horizontal tabs.
	     CSS sticky stacking: the tabs pin at the inherited
	     --sticky-header-height (preserved as --sticky-header-height-base for
	     our own tab strip), and we redefine --sticky-header-height for our
	     descendants to "old value + tab strip height" so any sticky element
	     below the tabs (e.g. editor toolbar, with its own variable row count)
	     pins under the tabs without having to know about them. Composes for
	     nested tabs. -->
	<div bind:this={contentWrapEl}>
		<div bind:this={tabStripEl} class="sticky z-[8] flex gap-1 border-b border-border bg-background" style="top: var(--sticky-header-height-base, 0px)">
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
								oncommit={onFieldCommit ? (val: unknown, old?: unknown) => onFieldCommit(childField.name, val, old) : undefined}
								{getValue}
								{onFieldChange}
								{onFieldCommit}
								{filter}
							/>
						{/each}
					</div>
				{/if}
			{/each}
		{/if}
	</div>
{/if}
