<script lang="ts">
	import {
		deleteObject,
		getObjects,
		type FlexDetailConfig,
		type FlexListFieldConfig,
		type FlexObject,
		type FlexObjectsPage,
	} from '$lib/api/endpoints/flexObjects';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { dialogs } from '$lib/stores/dialogs.svelte';
	import { Button } from '$lib/components/ui/button';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import DirectionalIcon from '$lib/components/ui/DirectionalIcon.svelte';
	import {
		ArrowDown,
		ArrowUp,
		ArrowUpDown,
		CircleCheck,
		CircleX,
		ExternalLink,
		Loader2,
		Pencil,
		Trash2,
	} from 'lucide-svelte';

	interface Props {
		detail: FlexDetailConfig;
		localValue: string | number | boolean;
	}

	type DetailColumn = {
		name: string;
		label: string;
		type: string;
		width?: number;
		link?: string;
		options?: Record<string, string>;
	};

	let { detail, localValue }: Props = $props();

	const DATE_TYPES = new Set(['date', 'datetime', 'datetime-local']);

	let data = $state<FlexObjectsPage | null>(null);
	let loading = $state(true);
	let error = $state(false);
	let currentPage = $state(1);
	let perPage = $state(10);
	let sortField = $state<string | null>(null);
	let sortOrder = $state<'asc' | 'desc'>('asc');
	let deletingKey = $state<string | null>(null);

	const columns = $derived.by<DetailColumn[]>(() => {
		const fields = detail.fields ?? {};
		const fieldTypes = detail.field_types ?? {};
		const fieldOptions = detail.field_options ?? {};
		return Object.entries(fields).map(([name, config]) => {
			const cfg: FlexListFieldConfig = config ?? {};
			return {
				name,
				label: cfg.field?.label ?? formatLabel(name),
				type: cfg.field?.type ?? fieldTypes[name] ?? 'text',
				width: cfg.width,
				link: cfg.link,
				options: fieldOptions[name],
			};
		});
	});

	const rangeStart = $derived(data && data.total > 0 ? (currentPage - 1) * perPage + 1 : 0);
	const rangeEnd = $derived(data ? Math.min(currentPage * perPage, data.total) : 0);
	const colSpan = $derived(Math.max(columns.length + (detail.actions ? 1 : 0), 1));

	$effect(() => {
		detail;
		localValue;
		perPage = detail.limit ?? 10;
		sortField = detail.relation.sort?.by ?? null;
		sortOrder = detail.relation.sort?.dir === 'desc' ? 'desc' : 'asc';
		currentPage = 1;
	});

	$effect(() => {
		const relationType = detail.relation.type;
		const foreignKey = detail.relation.foreign_key;
		const value = localValue;
		const page = currentPage;
		const limit = perPage;
		const sort = sortField;
		const order = sortOrder;
		void loadObjects(relationType, foreignKey, value, page, limit, sort, order);
	});

	function formatLabel(name: string): string {
		return name
			.replace(/_/g, ' ')
			.replace(/\b\w/g, (c) => c.toUpperCase());
	}

	async function loadObjects(
		type: string,
		foreignKey: string,
		value: string | number | boolean,
		page: number,
		limit: number,
		sort: string | null,
		order: 'asc' | 'desc',
	) {
		loading = true;
		error = false;
		try {
			data = await getObjects(type, {
				page,
				perPage: limit,
				sort: sort ?? undefined,
				order: sort ? order : undefined,
				filters: { [foreignKey]: value },
			});
			if (currentPage !== data.page) currentPage = data.page;
		} catch {
			error = true;
		} finally {
			loading = false;
		}
	}

	function toggleSort(field: string) {
		if (sortField === field) {
			sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
		} else {
			sortField = field;
			sortOrder = 'asc';
		}
		currentPage = 1;
	}

	function renderCell(object: FlexObject, fieldName: string): string {
		const val = object[fieldName];
		if (val === null || val === undefined) return '';
		if (typeof val === 'boolean') return val ? i18n.t('ADMIN_NEXT.YES') : i18n.t('ADMIN_NEXT.NO');
		return String(val);
	}

	function toDate(val: unknown): Date | null {
		let ms: number | null = null;
		if (typeof val === 'number') {
			ms = val < 1e11 ? val * 1000 : val;
		} else if (typeof val === 'string') {
			const trimmed = val.trim();
			if (trimmed === '') return null;
			if (/^\d+$/.test(trimmed)) {
				const n = Number(trimmed);
				ms = n < 1e11 ? n * 1000 : n;
			} else {
				const parsed = Date.parse(trimmed);
				if (Number.isNaN(parsed)) return null;
				ms = parsed;
			}
		}
		if (ms === null) return null;
		const d = new Date(ms);
		return Number.isNaN(d.getTime()) ? null : d;
	}

	function formatDateCell(val: unknown, withTime: boolean): string {
		if (val === null || val === undefined || val === '') return '';
		const d = toDate(val);
		if (!d) return String(val);
		const opts: Intl.DateTimeFormatOptions = {
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
		};
		if (withTime) {
			opts.hour = '2-digit';
			opts.minute = '2-digit';
			opts.hour12 = false;
		}
		return d.toLocaleString(undefined, opts);
	}

	function optionLabel(options: Record<string, string> | undefined, val: unknown): string {
		if (val === null || val === undefined) return '';
		const key = String(val);
		return options?.[key] ?? key;
	}

	function isUrl(val: unknown): boolean {
		return typeof val === 'string' && (val.startsWith('http://') || val.startsWith('https://'));
	}

	function fallback(key: string, text: string, params?: Record<string, string | number | boolean | Date | null | undefined>): string {
		return i18n.has(key) ? i18n.t(key, params) : text;
	}

	function editObject(key: string) {
		goto(`${base}/flex-objects/${detail.relation.type}/${key}`);
	}

	async function confirmDeleteObject(object: FlexObject) {
		const ok = await dialogs.confirm({
			title: i18n.t('ADMIN_NEXT.FLEX_OBJECTS.DELETE_OBJECT'),
			message: fallback(
				'ADMIN_NEXT.FLEX_OBJECTS.DELETE_CONFIRM',
				'Are you sure you want to delete this object? This action cannot be undone.',
			),
			confirmLabel: i18n.t('ADMIN_NEXT.DELETE'),
			cancelLabel: i18n.t('ADMIN_NEXT.CANCEL'),
			variant: 'destructive',
		});
		if (!ok) return;

		deletingKey = object.key;
		try {
			await deleteObject(detail.relation.type, object.key);
			toast.success(i18n.t('ADMIN_NEXT.FLEX_OBJECTS.OBJECT_DELETED'));
			await loadObjects(
				detail.relation.type,
				detail.relation.foreign_key,
				localValue,
				currentPage,
				perPage,
				sortField,
				sortOrder,
			);
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.FLEX_OBJECTS.FAILED_TO_DELETE_OBJECT'));
		} finally {
			deletingKey = null;
		}
	}
</script>

<div class="border-y border-border bg-muted/20">
	<div class="flex items-center justify-between border-b border-border px-4 py-2">
		<div class="min-w-0">
			<div class="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
				{detail.title ?? detail.label ?? detail.relation.type}
			</div>
		</div>
		{#if loading}
			<Loader2 size={14} class="animate-spin text-muted-foreground" />
		{/if}
	</div>

	{#if error}
		<div class="px-4 py-4 text-sm text-destructive">
			{i18n.t('ADMIN_NEXT.FLEX_OBJECTS.FAILED_TO_LOAD_OBJECTS')}
		</div>
	{:else}
		<div class="overflow-x-auto">
			<table class="w-full text-sm">
				<thead class="border-b border-border bg-background/80 text-xs uppercase tracking-wide text-muted-foreground">
					<tr>
						{#each columns as col}
							<th
								class="px-4 py-2 text-start font-medium"
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
											<ArrowUp size={11} />
										{:else}
											<ArrowDown size={11} />
										{/if}
									{:else}
										<ArrowUpDown size={11} class="opacity-30" />
									{/if}
								</button>
							</th>
						{/each}
						{#if detail.actions}
							<th class="w-20 px-4 py-2 text-end font-medium">
								{i18n.t('ADMIN_NEXT.FLEX_OBJECTS.ACTIONS')}
							</th>
						{/if}
					</tr>
				</thead>
				<tbody>
					{#each data?.objects ?? [] as obj (obj.key)}
						<tr class="border-b border-border/70 bg-background/60">
							{#each columns as col}
								<td class="px-4 py-2 text-foreground">
									{#if col.type === 'toggle'}
										{@const val = obj[col.name]}
										{#if val}
											<CircleCheck size={15} class="text-green-500" />
										{:else}
											<CircleX size={15} class="text-red-400" />
										{/if}
									{:else if DATE_TYPES.has(col.type)}
										{formatDateCell(obj[col.name], col.type !== 'date')}
									{:else if Array.isArray(obj[col.name])}
										<div class="flex flex-wrap gap-1">
											{#each (obj[col.name] as unknown[]).slice(0, 5) as tag}
												<span class="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
													{optionLabel(col.options, tag)}
												</span>
											{/each}
											{#if (obj[col.name] as unknown[]).length > 5}
												<span class="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
													+{(obj[col.name] as unknown[]).length - 5}
												</span>
											{/if}
										</div>
									{:else if col.options}
										{optionLabel(col.options, obj[col.name])}
									{:else if col.type === 'url' || isUrl(obj[col.name])}
										{@const url = String(obj[col.name] ?? '')}
										{#if url}
											<a
												href={url}
												target="_blank"
												rel="noopener noreferrer"
												class="inline-flex max-w-[200px] items-center gap-1 text-primary hover:underline"
											>
												<ExternalLink size={12} class="shrink-0" />
												<span class="truncate">{url.replace(/^https?:\/\//, '')}</span>
											</a>
										{/if}
									{:else}
										{renderCell(obj, col.name)}
									{/if}
								</td>
							{/each}
							{#if detail.actions}
								<td class="px-4 py-2 text-end">
									<div class="inline-flex items-center gap-1">
										<button
											type="button"
											class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
											aria-label={i18n.t('ADMIN_NEXT.EDIT')}
											title={i18n.t('ADMIN_NEXT.EDIT')}
											onclick={() => editObject(obj.key)}
										>
											<Pencil size={14} />
										</button>
										<button
											type="button"
											class="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-60"
											aria-label={i18n.t('ADMIN_NEXT.DELETE')}
											title={i18n.t('ADMIN_NEXT.DELETE')}
											disabled={deletingKey === obj.key}
											onclick={() => confirmDeleteObject(obj)}
										>
											{#if deletingKey === obj.key}
												<Loader2 size={14} class="animate-spin" />
											{:else}
												<Trash2 size={14} />
											{/if}
										</button>
									</div>
								</td>
							{/if}
						</tr>
					{/each}

					{#if !loading && (data?.objects.length ?? 0) === 0}
						<tr>
							<td colspan={colSpan} class="px-4 py-5 text-center text-sm text-muted-foreground">
								{fallback('ADMIN_NEXT.FLEX_OBJECTS.NO_ITEMS_FOUND', 'No items found')}
							</td>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>

		{#if data && data.totalPages > 0}
			<div class="flex items-center justify-between border-t border-border bg-background/70 px-4 py-2">
				<span class="text-xs text-muted-foreground">
					{fallback(
						'ADMIN_NEXT.FLEX_OBJECTS.DISPLAYING_RECORDS',
						`Displaying ${rangeStart} to ${rangeEnd} out of ${data.total} records`,
						{ from: rangeStart, to: rangeEnd, total: data.total },
					)}
				</span>
				{#if data.totalPages > 1}
					<div class="flex items-center gap-1">
						<Button
							variant="outline"
							size="icon"
							disabled={currentPage <= 1 || loading}
							onclick={() => currentPage = currentPage - 1}
							class="h-7 w-7"
							title={i18n.t('ADMIN_NEXT.FLEX_OBJECTS.PREVIOUS')}
						>
							<DirectionalIcon name="chevron-back" size={14} />
						</Button>
						<span class="min-w-16 text-center text-xs text-muted-foreground">
							{i18n.t('ADMIN_NEXT.PAGINATION.PAGE_OF', { current: currentPage, total: data.totalPages })}
						</span>
						<Button
							variant="outline"
							size="icon"
							disabled={currentPage >= data.totalPages || loading}
							onclick={() => currentPage = currentPage + 1}
							class="h-7 w-7"
							title={fallback('ADMIN_NEXT.FLEX_OBJECTS.NEXT', 'Next')}
						>
							<DirectionalIcon name="chevron-forward" size={14} />
						</Button>
					</div>
				{/if}
			</div>
		{/if}
	{/if}
</div>
