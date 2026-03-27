<script lang="ts">
	import { goto } from '$app/navigation';
	import { deletePage } from '$lib/api/endpoints/pages';
	import type { PageSummary } from '$lib/api/endpoints/pages';
	import { prefs, type PagesViewMode } from '$lib/stores/preferences.svelte';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import PagesTreeView from '$lib/components/pages/PagesTreeView.svelte';
	import PagesListView from '$lib/components/pages/PagesListView.svelte';
	import PagesMillerView from '$lib/components/pages/PagesMillerView.svelte';
	import {
		Plus, Search, TreePine, List, Columns3
	} from 'lucide-svelte';

	let searchQuery = $state('');

	const viewModes: { mode: PagesViewMode; icon: typeof TreePine; label: string }[] = [
		{ mode: 'tree', icon: TreePine, label: 'Tree' },
		{ mode: 'list', icon: List, label: 'List' },
		{ mode: 'miller', icon: Columns3, label: 'Columns' },
	];

	function handleEdit(route: string) {
		goto(`/pages/edit${route}`);
	}

	async function handleDelete(page: PageSummary) {
		if (!confirm(`Delete "${page.title}" at ${page.route}?`)) return;
		try {
			await deletePage(page.route, { children: true });
			toast.success(`Deleted "${page.title}"`);
			// Force re-render
			const current = prefs.pagesViewMode;
			prefs.pagesViewMode = 'list';
			await new Promise(r => setTimeout(r, 10));
			prefs.pagesViewMode = current;
		} catch {
			toast.error('Failed to delete page');
		}
	}
</script>

<svelte:head>
	<title>Pages — Grav Admin</title>
</svelte:head>

<div class="mx-auto max-w-7xl space-y-4">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-xl font-semibold tracking-tight text-foreground">Pages</h1>
		</div>
		<Button onclick={() => goto('/pages/new')}>
			<Plus size={15} />
			Add Page
		</Button>
	</div>

	<!-- Toolbar -->
	<div class="flex items-center gap-3">
		<!-- Search -->
		{#if prefs.pagesViewMode !== 'miller'}
			<div class="relative flex-1" style="max-width: 320px;">
				<Search size={14} class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
				<input
					type="text"
					class="flex h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
					placeholder="Search pages..."
					bind:value={searchQuery}
				/>
			</div>
		{/if}

		<div class="flex-1"></div>

		<!-- View mode toggle -->
		<div class="inline-flex rounded-md border border-border shadow-sm">
			{#each viewModes as vm}
				<button
					class="inline-flex h-8 items-center gap-1.5 px-3 text-[12px] font-medium transition-colors first:rounded-l-md last:rounded-r-md
						{prefs.pagesViewMode === vm.mode
							? 'bg-accent text-accent-foreground'
							: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}"
					onclick={() => prefs.pagesViewMode = vm.mode}
					title={vm.label}
				>
					<vm.icon size={14} />
					<span class="hidden sm:inline">{vm.label}</span>
				</button>
			{/each}
		</div>
	</div>

	<!-- View content -->
	<div class="overflow-hidden rounded-lg border border-border bg-card">
		{#if prefs.pagesViewMode === 'tree'}
			<PagesTreeView {searchQuery} onEdit={handleEdit} onDelete={handleDelete} />
		{:else if prefs.pagesViewMode === 'list'}
			<PagesListView {searchQuery} onEdit={handleEdit} onDelete={handleDelete} />
		{:else if prefs.pagesViewMode === 'miller'}
			<PagesMillerView onEdit={handleEdit} />
		{/if}
	</div>
</div>
