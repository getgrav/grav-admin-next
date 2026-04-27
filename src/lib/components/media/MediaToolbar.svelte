<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { mediaManager, type TypeFilter, type SortField } from '$lib/stores/mediaManager.svelte';
	import {
		Search, X, LayoutGrid, List, FolderPlus, Upload,
		ChevronRight, Trash2, ArrowUpDown, SlidersHorizontal,
		ImageIcon, Video, Music, FileText, FolderOpen
	} from 'lucide-svelte';

	interface Props {
		onupload: () => void;
		onnewfolder: () => void;
		ondeleteselected: () => void;
		readonly?: boolean;
	}

	let { onupload, onnewfolder, ondeleteselected, readonly = false }: Props = $props();

	let searchInput = $state('');
	let searchTimer: ReturnType<typeof setTimeout> | null = null;

	function handleSearchInput(value: string) {
		searchInput = value;
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			mediaManager.search(value);
		}, 300);
	}

	function clearSearch() {
		searchInput = '';
		if (searchTimer) clearTimeout(searchTimer);
		mediaManager.search('');
	}

	// Breadcrumb segments
	const breadcrumbs = $derived.by(() => {
		if (mediaManager.isSearching) return [];
		const path = mediaManager.currentPath;
		if (!path) return [];
		return path.split('/');
	});

	const typeFilters: { value: TypeFilter; label: string; icon: typeof ImageIcon }[] = [
		{ value: '', label: 'All', icon: SlidersHorizontal },
		{ value: 'image', label: 'Images', icon: ImageIcon },
		{ value: 'video', label: 'Video', icon: Video },
		{ value: 'audio', label: 'Audio', icon: Music },
		{ value: 'document', label: 'Docs', icon: FileText },
	];

	const sortOptions: { value: SortField; label: string }[] = [
		{ value: 'name', label: 'Name' },
		{ value: 'size', label: 'Size' },
		{ value: 'modified', label: 'Date' },
		{ value: 'type', label: 'Type' },
	];

	const selectionCount = $derived(mediaManager.selectedFiles.size);
</script>

<!-- Breadcrumbs -->
<div class="flex items-center gap-1 border-b border-border px-4 py-2 text-sm">
	<button
		class="rounded px-1.5 py-0.5 text-[13px] font-medium transition-colors
			{!mediaManager.currentPath && !mediaManager.isSearching
				? 'text-foreground'
				: 'text-muted-foreground hover:text-foreground'}"
		onclick={() => mediaManager.navigateTo('')}
	>
		<span class="flex items-center gap-1">
			<FolderOpen size={14} />
			Media
		</span>
	</button>
	{#each breadcrumbs as segment, i}
		<ChevronRight size={12} class="text-muted-foreground/50" />
		<button
			class="rounded px-1.5 py-0.5 text-[13px] font-medium transition-colors
				{i === breadcrumbs.length - 1
					? 'text-foreground'
					: 'text-muted-foreground hover:text-foreground'}"
			onclick={() => mediaManager.navigateTo(breadcrumbs.slice(0, i + 1).join('/'))}
		>
			{segment}
		</button>
	{/each}
	{#if mediaManager.isSearching}
		<ChevronRight size={12} class="text-muted-foreground/50" />
		<span class="text-[13px] text-muted-foreground">
			Search: "{mediaManager.searchQuery}"
		</span>
	{/if}
</div>

<!-- Toolbar -->
<div class="flex items-center gap-2 border-b border-border px-4 py-2">
	<!-- Search -->
	<div class="relative flex-1">
		<Search size={14} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
		<input
			type="text"
			class="h-8 w-full rounded-md border border-input bg-muted/50 pl-9 pr-8 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
			placeholder={i18n.t('ADMIN_NEXT.MEDIA.MEDIA_TOOLBAR.SEARCH_MEDIA')}
			value={searchInput}
			oninput={(e) => handleSearchInput(e.currentTarget.value)}
		/>
		{#if searchInput}
			<button
				class="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground"
				onclick={clearSearch}
				aria-label={i18n.t('ADMIN_NEXT.CLEAR_SEARCH')}
			>
				<X size={14} />
			</button>
		{/if}
	</div>

	<!-- Type filter -->
	<div class="hidden items-center sm:flex">
		{#each typeFilters as filter}
			<button
				class="inline-flex h-8 items-center gap-1 px-2.5 text-[12px] font-medium transition-colors first:rounded-l-md first:border first:border-r-0 last:rounded-r-md last:border last:border-l-0 [&:not(:first-child):not(:last-child)]:border-y
					{mediaManager.typeFilter === filter.value
						? 'border-primary/30 bg-primary/10 text-primary'
						: 'border-border text-muted-foreground hover:bg-accent/50 hover:text-foreground'}"
				onclick={() => mediaManager.setTypeFilter(filter.value)}
			>
				<filter.icon size={13} />
				<span class="hidden lg:inline">{filter.label}</span>
			</button>
		{/each}
	</div>

	<!-- Sort -->
	<select
		class="h-8 rounded-md border border-input bg-muted/50 px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
		value={mediaManager.sortField}
		onchange={(e) => mediaManager.setSort(e.currentTarget.value as SortField)}
	>
		{#each sortOptions as opt}
			<option value={opt.value}>{opt.label}</option>
		{/each}
	</select>

	<!-- View toggle -->
	<div class="inline-flex rounded-md border border-border shadow-sm">
		<button
			class="inline-flex h-8 w-8 items-center justify-center transition-colors first:rounded-l-md last:rounded-r-md
				{mediaManager.viewMode === 'grid'
					? 'bg-accent text-accent-foreground'
					: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}"
			onclick={() => mediaManager.viewMode = 'grid'}
			aria-label={i18n.t('ADMIN_NEXT.MEDIA.MEDIA_TOOLBAR.GRID_VIEW')}
		>
			<LayoutGrid size={14} />
		</button>
		<button
			class="inline-flex h-8 w-8 items-center justify-center transition-colors first:rounded-l-md last:rounded-r-md
				{mediaManager.viewMode === 'list'
					? 'bg-accent text-accent-foreground'
					: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}"
			onclick={() => mediaManager.viewMode = 'list'}
			aria-label={i18n.t('ADMIN_NEXT.MEDIA.MEDIA_TOOLBAR.LIST_VIEW')}
		>
			<List size={14} />
		</button>
	</div>

	<!-- Separator -->
	<div class="h-5 w-px bg-border"></div>

	{#if !readonly}
	<!-- Bulk actions -->
	{#if selectionCount > 0}
		<button
			class="inline-flex h-8 items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 text-[12px] font-medium text-destructive transition-colors hover:bg-destructive/20"
			onclick={ondeleteselected}
		>
			<Trash2 size={13} />
			Delete ({selectionCount})
		</button>
	{/if}

	<!-- New folder -->
	<button
		class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
		onclick={onnewfolder}
		aria-label={i18n.t('ADMIN_NEXT.MEDIA.MEDIA_TOOLBAR.NEW_FOLDER')}
	>
		<FolderPlus size={14} />
		<span class="hidden md:inline">{i18n.t('ADMIN_NEXT.MEDIA.MEDIA_TOOLBAR.FOLDER')}</span>
	</button>

	<!-- Upload -->
	<button
		class="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
		onclick={onupload}
	>
		<Upload size={13} />
		<span class="hidden md:inline">{i18n.t('ADMIN_NEXT.UPLOAD')}</span>
	</button>
	{/if}
</div>
