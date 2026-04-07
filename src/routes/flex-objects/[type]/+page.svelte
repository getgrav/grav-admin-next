<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import {
		getDirectories,
		getObjects,
		deleteObject,
		exportObjects,
		type FlexDirectoryInfo,
		type FlexObjectsPage,
		type FlexObject,
	} from '$lib/api/endpoints/flexObjects';
	import { invalidations } from '$lib/stores/invalidation.svelte';
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import { toast } from 'svelte-sonner';
	import {
		Search,
		Plus,
		Loader2,
		ChevronRight,
		ChevronLeft,
		ChevronsRight,
		ChevronsLeft,
		ArrowUpDown,
		ArrowUp,
		ArrowDown,
		Trash2,
		Pencil,
		Download,
		ExternalLink,
		CircleCheck,
		CircleX,
	} from 'lucide-svelte';

	const type = $derived(page.params.type ?? '');

	let directory = $state<FlexDirectoryInfo | null>(null);
	let data = $state<FlexObjectsPage | null>(null);
	let loading = $state(true);
	let search = $state('');
	let currentPage = $state(1);
	let perPage = $state(15);
	let sortField = $state<string | null>(null);
	let sortOrder = $state<'asc' | 'desc'>('asc');

	const perPageOptions = [15, 25, 50, 100, 200];

	// Delete confirmation
	let deleteOpen = $state(false);
	let deleteTarget = $state<FlexObject | null>(null);
	let deleting = $state(false);

	// Derive column definitions from directory config
	const columns = $derived.by(() => {
		if (!directory?.list?.fields) return [];
		const fieldTypes = directory.field_types ?? {};
		return Object.entries(directory.list.fields).map(([name, config]) => {
			const cfg = config ?? {};
			return {
				name,
				label: cfg.field?.label ?? formatLabel(name),
				// Prefer explicit list field type, then blueprint form type, then text
				type: cfg.field?.type ?? fieldTypes[name] ?? 'text',
				width: cfg.width,
				link: cfg.link,
			};
		});
	});

	// Check if any column has link: edit
	const hasEditLink = $derived(columns.some((c) => c.link === 'edit'));

	// Pagination display
	const rangeStart = $derived(data ? (currentPage - 1) * perPage + 1 : 0);
	const rangeEnd = $derived(data ? Math.min(currentPage * perPage, data.total) : 0);

	// Smart page numbers: show window of pages around current
	const pageNumbers = $derived.by(() => {
		if (!data || data.totalPages <= 1) return [];
		const total = data.totalPages;
		const current = currentPage;
		const pages: number[] = [];
		const start = Math.max(2, current - 2);
		const end = Math.min(total - 1, current + 2);
		for (let i = start; i <= end; i++) pages.push(i);
		return pages;
	});

	function formatLabel(name: string): string {
		return name
			.replace(/_/g, ' ')
			.replace(/\b\w/g, (c) => c.toUpperCase());
	}

	async function loadDirectory() {
		try {
			const dirs = await getDirectories();
			directory = dirs.find((d) => d.type === type) ?? null;
			if (directory) {
				await loadObjects(1);
			} else {
				loading = false;
			}
		} catch {
			toast.error('Failed to load directory');
			loading = false;
		}
	}

	async function loadObjects(pg = 1) {
		loading = true;
		try {
			data = await getObjects(type, {
				page: pg,
				perPage,
				search: search || undefined,
				sort: sortField ?? undefined,
				order: sortField ? sortOrder : undefined,
			});
			currentPage = data.page;
		} catch {
			toast.error('Failed to load objects');
		} finally {
			loading = false;
		}
	}

	// Debounced search
	let searchTimer: ReturnType<typeof setTimeout>;
	function handleSearchInput() {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			currentPage = 1;
			loadObjects(1);
		}, 300);
	}

	function toggleSort(field: string) {
		if (sortField === field) {
			sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
		} else {
			sortField = field;
			sortOrder = 'asc';
		}
		loadObjects(1);
	}

	function handlePerPageChange(e: Event) {
		const val = (e.target as HTMLSelectElement).value;
		perPage = parseInt(val, 10);
		currentPage = 1;
		loadObjects(1);
	}

	function renderCell(object: FlexObject, fieldName: string): string {
		const val = object[fieldName];
		if (val === null || val === undefined) return '';
		if (typeof val === 'boolean') return val ? 'Yes' : 'No';
		return String(val);
	}

	function isUrl(val: unknown): boolean {
		return typeof val === 'string' && (val.startsWith('http://') || val.startsWith('https://'));
	}

	function openEdit(key: string) {
		goto(`${base}/flex-objects/${type}/${key}`);
	}

	function confirmDelete(obj: FlexObject) {
		deleteTarget = obj;
		deleteOpen = true;
	}

	async function handleDelete() {
		if (!deleteTarget) return;
		deleting = true;
		try {
			await deleteObject(type, deleteTarget.key);
			toast.success('Object deleted');
			deleteOpen = false;
			deleteTarget = null;
			await loadObjects(currentPage);
		} catch {
			toast.error('Failed to delete object');
		} finally {
			deleting = false;
		}
	}

	async function handleExport() {
		try {
			const { blob, filename } = await exportObjects(type);
			const a = document.createElement('a');
			a.href = URL.createObjectURL(blob);
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(a.href);
		} catch {
			toast.error('Export failed');
		}
	}

	$effect(() => {
		type;
		loadDirectory();
	});

	onMount(() => {
		const unsub = invalidations.subscribe(`flex-objects:${type}:*`, () =>
			loadObjects(currentPage),
		);
		const unsubFocus = invalidations.subscribe('*:focus', () => loadObjects(currentPage));
		return () => {
			unsub();
			unsubFocus();
		};
	});
</script>

<svelte:head>
	<title>{directory?.title ?? type} — Grav Admin</title>
</svelte:head>

<div class="flex h-full flex-col">
	<!-- Header -->
	<div class="flex min-h-14 items-center justify-between border-b border-border px-6 pt-6 pb-3">
		<div>
			<h1 class="text-xl font-semibold tracking-tight text-foreground">
				{directory?.title ?? type}
			</h1>
			{#if data}
				<p class="mt-0.5 text-xs text-muted-foreground">
					{data.total} item{data.total !== 1 ? 's' : ''}
				</p>
			{/if}
		</div>
		<div class="flex items-center gap-2">
			{#if directory?.export && Object.keys(directory.export).length > 0}
				<Button variant="outline" size="sm" onclick={handleExport}>
					<Download size={14} />
					Export
				</Button>
			{/if}
			<Button size="sm" onclick={() => goto(`${base}/flex-objects/${type}/new`)}>
				<Plus size={14} />
				Add
			</Button>
		</div>
	</div>

	<!-- Toolbar -->
	<div class="flex items-center gap-3 border-b border-border px-4 py-2">
		<div class="relative flex-1">
			<Search
				size={14}
				class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
			/>
			<input
				type="text"
				class="h-8 w-full rounded-md border border-input bg-muted/50 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
				placeholder="Search..."
				bind:value={search}
				oninput={handleSearchInput}
			/>
		</div>
		<select
			class="h-8 rounded-md border border-input bg-muted/50 px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
			onchange={handlePerPageChange}
		>
			{#each perPageOptions as opt}
				<option value={opt} selected={perPage === opt}>{opt}</option>
			{/each}
		</select>
	</div>

	{#if loading && !data}
		<div class="flex flex-1 items-center justify-center">
			<Loader2 size={24} class="animate-spin text-muted-foreground" />
		</div>
	{:else if directory && data}
		<!-- Table -->
		<div class="flex-1 overflow-auto">
			<table class="w-full">
				<thead class="sticky top-0 z-10 bg-background">
					<tr class="border-b border-border">
						{#each columns as col}
							<th
								class="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
								style={col.width ? `width: ${col.width}%` : ''}
							>
								<button
									type="button"
									class="inline-flex items-center gap-1 hover:text-foreground"
									onclick={() => toggleSort(col.name)}
								>
									{col.label}
									{#if sortField === col.name}
										{#if sortOrder === 'asc'}
											<ArrowUp size={12} />
										{:else}
											<ArrowDown size={12} />
										{/if}
									{:else}
										<ArrowUpDown size={12} class="opacity-30" />
									{/if}
								</button>
							</th>
						{/each}
						<th class="w-20 px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
							Actions
						</th>
					</tr>
				</thead>
				<tbody>
					{#each data.objects as obj (obj.key)}
						<tr class="group border-b border-border transition-colors hover:bg-muted/50">
							{#each columns as col}
								<td class="px-4 py-2.5 text-sm text-foreground">
									{#if col.type === 'toggle'}
										{@const val = obj[col.name]}
										{#if val}
											<CircleCheck size={16} class="text-green-500" />
										{:else}
											<CircleX size={16} class="text-red-400" />
										{/if}
									{:else if col.link === 'edit'}
										<button
											type="button"
											class="font-medium text-primary hover:underline"
											onclick={() => openEdit(obj.key)}
										>
											{renderCell(obj, col.name)}
										</button>
									{:else if col.type === 'url' || isUrl(obj[col.name])}
										{@const url = String(obj[col.name] ?? '')}
										{#if url}
											<a
												href={url}
												target="_blank"
												rel="noopener noreferrer"
												class="inline-flex items-center gap-1 text-primary hover:underline"
												onclick={(e) => e.stopPropagation()}
											>
												<ExternalLink size={12} class="shrink-0" />
												<span class="truncate max-w-[200px]">{url.replace(/^https?:\/\//, '')}</span>
											</a>
										{/if}
									{:else if Array.isArray(obj[col.name])}
										<div class="flex flex-wrap gap-1">
											{#each (obj[col.name] as string[]).slice(0, 5) as tag}
												<span class="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
													{tag}
												</span>
											{/each}
											{#if (obj[col.name] as string[]).length > 5}
												<span class="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
													+{(obj[col.name] as string[]).length - 5}
												</span>
											{/if}
										</div>
									{:else}
										{renderCell(obj, col.name)}
									{/if}
								</td>
							{/each}
							<td class="px-4 py-2.5 text-right">
								<div class="flex items-center justify-end gap-1">
									<button
										type="button"
										class="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
										title="Edit"
										onclick={() => openEdit(obj.key)}
									>
										<Pencil size={14} />
									</button>
									<button
										type="button"
										class="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
										title="Delete"
										onclick={() => confirmDelete(obj)}
									>
										<Trash2 size={14} />
									</button>
								</div>
							</td>
						</tr>
					{/each}

					{#if data.objects.length === 0}
						<tr>
							<td
								colspan={columns.length + 1}
								class="px-4 py-8 text-center text-sm text-muted-foreground"
							>
								{search ? 'No items match your search' : 'No items found'}
							</td>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>

		<!-- Pagination -->
		{#if data.totalPages > 0}
			<div class="flex items-center justify-between border-t border-border px-4 py-2">
				<span class="text-xs text-muted-foreground">
					Displaying {rangeStart} to {rangeEnd} out of {data.total} records
				</span>
				{#if data.totalPages > 1}
					<div class="flex items-center gap-0.5">
						<!-- First -->
						<Button
							variant="outline"
							size="icon"
							disabled={currentPage <= 1}
							onclick={() => loadObjects(1)}
							class="h-7 w-7"
							title="First"
						>
							<ChevronsLeft size={14} />
						</Button>
						<!-- Prev -->
						<Button
							variant="outline"
							size="icon"
							disabled={currentPage <= 1}
							onclick={() => loadObjects(currentPage - 1)}
							class="h-7 w-7"
							title="Previous"
						>
							<ChevronLeft size={14} />
						</Button>

						<!-- Page 1 -->
						<Button
							variant={currentPage === 1 ? 'default' : 'outline'}
							size="icon"
							onclick={() => loadObjects(1)}
							class="h-7 w-7 text-xs"
						>
							1
						</Button>

						<!-- Ellipsis before -->
						{#if pageNumbers.length > 0 && pageNumbers[0] > 2}
							<span class="px-1 text-xs text-muted-foreground">...</span>
						{/if}

						<!-- Middle pages -->
						{#each pageNumbers as pg}
							<Button
								variant={currentPage === pg ? 'default' : 'outline'}
								size="icon"
								onclick={() => loadObjects(pg)}
								class="h-7 w-7 text-xs"
							>
								{pg}
							</Button>
						{/each}

						<!-- Ellipsis after -->
						{#if pageNumbers.length > 0 && pageNumbers[pageNumbers.length - 1] < data.totalPages - 1}
							<span class="px-1 text-xs text-muted-foreground">...</span>
						{/if}

						<!-- Last page -->
						{#if data.totalPages > 1}
							<Button
								variant={currentPage === data.totalPages ? 'default' : 'outline'}
								size="icon"
								onclick={() => loadObjects(data!.totalPages)}
								class="h-7 w-7 text-xs"
							>
								{data.totalPages}
							</Button>
						{/if}

						<!-- Next -->
						<Button
							variant="outline"
							size="icon"
							disabled={currentPage >= data.totalPages}
							onclick={() => loadObjects(currentPage + 1)}
							class="h-7 w-7"
							title="Next"
						>
							<ChevronRight size={14} />
						</Button>
						<!-- Last -->
						<Button
							variant="outline"
							size="icon"
							disabled={currentPage >= data.totalPages}
							onclick={() => loadObjects(data!.totalPages)}
							class="h-7 w-7"
							title="Last"
						>
							<ChevronsRight size={14} />
						</Button>
					</div>
				{/if}
			</div>
		{/if}
	{/if}
</div>

<ConfirmModal
	open={deleteOpen}
	title="Delete Object"
	message="Are you sure you want to delete this object? This action cannot be undone."
	confirmLabel={deleting ? 'Deleting...' : 'Delete'}
	onconfirm={handleDelete}
	oncancel={() => {
		deleteOpen = false;
		deleteTarget = null;
	}}
/>
