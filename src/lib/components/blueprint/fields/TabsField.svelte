<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import FieldRenderer from '../FieldRenderer.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';

	interface Props {
		field: BlueprintField;
		getValue: (path: string) => unknown;
		onFieldChange: (path: string, value: unknown) => void;
	}

	let { field, getValue, onFieldChange }: Props = $props();
	const translateLabel = i18n.tMaybe;

	const tabs = $derived((field.fields ?? []).filter((f) => f.type === 'tab' || f.fields));
	const isSideTabs = $derived(field.classes?.includes('side-tabs') ?? false);

	// Resolve initial tab from URL hash (e.g., #languages)
	function getInitialIndex(): number {
		if (typeof window === 'undefined') return 0;
		const hash = window.location.hash.slice(1).toLowerCase();
		if (!hash) return 0;
		const idx = tabs.findIndex((t) => t.name.toLowerCase() === hash);
		return idx >= 0 ? idx : 0;
	}

	let activeIndex = $state(getInitialIndex());
	const tabKey = $derived(tabs.map((t) => t.name).join(','));
	let prevTabKey = $state(tabKey);

	// Only re-resolve activeIndex when the tabs actually change (blueprint reload)
	$effect(() => {
		if (tabKey === prevTabKey) return;
		prevTabKey = tabKey;
		if (tabs.length === 0) return;
		const hash = typeof window !== 'undefined' ? window.location.hash.slice(1).toLowerCase() : '';
		if (hash) {
			const idx = tabs.findIndex((t) => t.name.toLowerCase() === hash);
			activeIndex = idx >= 0 ? idx : 0;
		} else if (activeIndex >= tabs.length) {
			activeIndex = 0;
		}
	});

	function setActiveTab(index: number) {
		activeIndex = index;
		const tab = tabs[index];
		if (tab) {
			history.replaceState(null, '', `#${tab.name}`);
		}
	}

	// Listen for hash changes (browser back/forward)
	$effect(() => {
		function onHashChange() {
			const hash = window.location.hash.slice(1).toLowerCase();
			if (!hash) return;
			const idx = tabs.findIndex((t) => t.name.toLowerCase() === hash);
			if (idx >= 0 && idx !== activeIndex) {
				activeIndex = idx;
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
					<button
						class="whitespace-nowrap rounded-md px-3 py-2 text-left text-sm font-medium transition-colors
							{i === activeIndex
								? 'bg-primary/10 text-primary'
								: 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}"
						onclick={() => setActiveTab(i)}
					>
						{translateLabel(tab.title || tab.label || tab.name)}
					</button>
				{/each}
			</nav>
		</div>

		<!-- Active tab content -->
		<div class="min-w-0 flex-1 p-4 lg:pl-6">
			{#each tabs as tab, i (tab.name)}
				{#if i === activeIndex && tab.fields}
					<div class="space-y-4">
						{#each tab.fields as childField (childField.name)}
							<FieldRenderer
								field={childField}
								value={getValue(childField.name)}
								onchange={(val) => onFieldChange(childField.name, val)}
								{getValue}
								{onFieldChange}
							/>
						{/each}
					</div>
				{/if}
			{/each}
		</div>
	</div>
{:else}
	<!-- Standard horizontal tabs -->
	<div>
		<div class="flex gap-1 border-b border-border">
			{#each tabs as tab, i (tab.name)}
				<button
					class="border-b-2 px-4 py-2 text-sm font-medium transition-colors
						{i === activeIndex
							? 'border-primary text-primary'
							: 'border-transparent text-muted-foreground hover:text-foreground'}"
					onclick={() => setActiveTab(i)}
				>
					{translateLabel(tab.title || tab.label || tab.name)}
				</button>
			{/each}
		</div>

		{#each tabs as tab, i (tab.name)}
			{#if i === activeIndex && tab.fields}
				<div class="space-y-4 pt-4">
					{#each tab.fields as childField (childField.name)}
						<FieldRenderer
							field={childField}
							value={getValue(childField.name)}
							onchange={(val) => onFieldChange(childField.name, val)}
							{getValue}
							{onFieldChange}
						/>
					{/each}
				</div>
			{/if}
		{/each}
	</div>
{/if}
