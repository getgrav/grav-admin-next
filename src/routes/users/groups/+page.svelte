<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import { getGroups, deleteGroup, type GroupInfo, type GroupsPage } from '$lib/api/endpoints/groups';
	import { invalidations } from '$lib/stores/invalidation.svelte';
	import { prefs } from '$lib/stores/preferences.svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import { canWrite } from '$lib/utils/permissions';
	import { Button } from '$lib/components/ui/button';
	import StickyHeader from '$lib/components/ui/StickyHeader.svelte';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import DirectionalIcon from '$lib/components/ui/DirectionalIcon.svelte';
	import UsersTabNav from '$lib/components/users/UsersTabNav.svelte';
	import GroupsTableView from '$lib/components/users/GroupsTableView.svelte';
	import { toast } from 'svelte-sonner';
	import { Search, Plus, Loader2, LayoutGrid, Table as TableIcon, ShieldCheck, ShieldOff, Users } from 'lucide-svelte';

	// Group write requires admin.super server-side — gate the Add/Delete UI
	// rather than letting a non-super-admin hit a 403.
	const canEdit = $derived(auth.isSuperAdmin || canWrite('users'));

	let data = $state<GroupsPage | null>(null);
	let loading = $state(true);
	let search = $state('');
	let currentPage = $state(1);
	let selectedName = $state<string | null>(null);
	let pendingDelete = $state<string | null>(null);
	let confirmDeleteOpen = $state(false);
	const perPage = 20;

	const filtered = $derived.by(() => {
		if (!data) return [];
		let list = data.groups;
		if (search) {
			const q = search.toLowerCase();
			list = list.filter(
				(g) =>
					g.groupname.toLowerCase().includes(q) ||
					(g.readableName ?? '').toLowerCase().includes(q) ||
					(g.description ?? '').toLowerCase().includes(q),
			);
		}
		return list;
	});

	const selected = $derived(
		selectedName ? data?.groups.find((g) => g.groupname === selectedName) ?? null : null,
	);

	async function loadGroups(page = 1) {
		loading = true;
		try {
			data = await getGroups(page, perPage);
			currentPage = data.page;
			if (!selectedName && data.groups.length > 0) {
				selectedName = data.groups[0].groupname;
			}
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.GROUPS.FAILED_TO_LOAD_GROUPS'));
		} finally {
			loading = false;
		}
	}

	const hasDetailPanel = () =>
		typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;

	function selectGroup(name: string) {
		if (!hasDetailPanel()) {
			openEdit(name);
			return;
		}
		selectedName = name;
	}

	function openEdit(name: string) {
		goto(`${base}/users/groups/${name}`);
	}

	function requestDelete(name: string) {
		pendingDelete = name;
		confirmDeleteOpen = true;
	}

	async function confirmDelete() {
		const name = pendingDelete;
		confirmDeleteOpen = false;
		pendingDelete = null;
		if (!name) return;
		try {
			await deleteGroup(name);
			toast.success(i18n.t('ADMIN_NEXT.GROUPS.GROUP_DELETED', { name }));
			if (selectedName === name) selectedName = null;
			loadGroups(currentPage);
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.GROUPS.GROUP_DELETE_FAILED', { name }));
		}
	}

	function flattenAccess(access: Record<string, unknown>, prefix = ''): string[] {
		const result: string[] = [];
		for (const [key, value] of Object.entries(access)) {
			const path = prefix ? `${prefix}.${key}` : key;
			if (value === true) {
				result.push(path);
			} else if (value && typeof value === 'object') {
				result.push(...flattenAccess(value as Record<string, unknown>, path));
			}
		}
		return result;
	}

	$effect(() => { loadGroups(); });

	onMount(() => {
		const unsubGroups = invalidations.subscribe('groups:*', () => loadGroups(currentPage));
		const unsubFocus = invalidations.subscribe('*:focus', () => loadGroups(currentPage));
		return () => { unsubGroups(); unsubFocus(); };
	});
</script>

<svelte:head>
	<title>{i18n.t('ADMIN_NEXT.GROUPS.GROUPS_GRAV_ADMIN')}</title>
</svelte:head>

<div class="flex h-full flex-col">
	<StickyHeader noBorder>
		{#snippet children({ scrolled })}
			<div class="px-6 transition-[padding] duration-200 {scrolled ? 'py-2' : 'pt-6 pb-3'}">
				<div class="flex items-center justify-between {scrolled ? 'min-h-6' : 'min-h-8'}">
					<div>
						<h1 class="font-semibold tracking-tight text-foreground transition-[font-size] duration-200 {scrolled ? 'text-sm' : 'text-xl'}">{i18n.t('ADMIN_NEXT.GROUPS.GROUPS')}</h1>
						{#if !scrolled && data}
							<p class="mt-0.5 text-xs text-muted-foreground">
								{i18n.t(data.total === 1 ? 'ADMIN_NEXT.GROUPS.GROUP_COUNT_ONE' : 'ADMIN_NEXT.GROUPS.GROUP_COUNT_OTHER', { n: data.total })}
							</p>
						{/if}
					</div>
					{#if canEdit}
						<Button size="sm" onclick={() => goto(`${base}/users/groups/new`)}>
							<Plus size={14} />
							{i18n.t('ADMIN_NEXT.GROUPS.ADD_GROUP')}
						</Button>
					{/if}
				</div>
			</div>
		{/snippet}
	</StickyHeader>

	<UsersTabNav />

	{#if loading}
		<div class="flex flex-1 items-center justify-center">
			<Loader2 size={24} class="animate-spin text-muted-foreground" />
		</div>
	{:else if data}
		<div class="flex items-center gap-3 border-b border-border px-4 py-2">
			<div class="relative flex-1">
				<Search size={14} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
				<input
					type="text"
					class="h-8 w-full rounded-md border border-input bg-muted/50 ps-9 pe-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
					placeholder={i18n.t('ADMIN_NEXT.GROUPS.SEARCH_GROUPS')}
					bind:value={search}
				/>
			</div>
			<div class="inline-flex rounded-md border border-border shadow-sm">
				<button
					class="inline-flex h-8 items-center gap-1.5 px-3 text-[0.75rem] font-medium transition-colors first:rounded-l-md last:rounded-r-md
						{prefs.groupsViewMode === 'cards'
							? 'bg-accent text-accent-foreground'
							: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}"
					onclick={() => prefs.groupsViewMode = 'cards'}
					title={i18n.t('ADMIN_NEXT.USERS_TABLE.CARDS')}
				>
					<LayoutGrid size={14} />
					<span class="hidden sm:inline">{i18n.t('ADMIN_NEXT.USERS_TABLE.CARDS')}</span>
				</button>
				<button
					class="inline-flex h-8 items-center gap-1.5 px-3 text-[0.75rem] font-medium transition-colors first:rounded-l-md last:rounded-r-md
						{prefs.groupsViewMode === 'table'
							? 'bg-accent text-accent-foreground'
							: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}"
					onclick={() => prefs.groupsViewMode = 'table'}
					title={i18n.t('ADMIN_NEXT.USERS_TABLE.TABLE')}
				>
					<TableIcon size={14} />
					<span class="hidden sm:inline">{i18n.t('ADMIN_NEXT.USERS_TABLE.TABLE')}</span>
				</button>
			</div>
		</div>

		{#if prefs.groupsViewMode === 'table'}
			<div class="flex-1 overflow-y-auto">
				<GroupsTableView
					groups={filtered}
					{canEdit}
					onEdit={openEdit}
					onDelete={canEdit ? requestDelete : undefined}
				/>
			</div>
		{:else}
		<div class="flex flex-1 overflow-hidden">
			<div class="flex w-full flex-col border-e border-border lg:w-[400px] xl:w-[440px]">
				<div class="flex-1 overflow-y-auto">
					{#each filtered as group (group.groupname)}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<div
							class="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-start transition-colors
								{selectedName === group.groupname ? 'bg-accent' : 'hover:bg-muted/50'}"
							onclick={() => selectGroup(group.groupname)}
							ondblclick={() => openEdit(group.groupname)}
						>
							<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
								<Users size={16} class="text-muted-foreground" />
							</div>
							<div class="min-w-0 flex-1">
								<div class="truncate text-sm font-medium text-foreground">
									{group.readableName || group.groupname}
								</div>
								<p class="truncate text-xs text-muted-foreground">{group.groupname}</p>
							</div>
							{#if group.enabled}
								<ShieldCheck size={14} class="shrink-0 text-green-500/80" />
							{:else}
								<ShieldOff size={14} class="shrink-0 text-muted-foreground/60" />
							{/if}
						</div>
					{/each}
					{#if filtered.length === 0}
						<div class="px-4 py-8 text-center text-sm text-muted-foreground">
							{search ? i18n.t('ADMIN_NEXT.GROUPS.NO_GROUPS_MATCH_SEARCH') : i18n.t('ADMIN_NEXT.GROUPS.NO_GROUPS')}
						</div>
					{/if}
				</div>
			</div>

			<div class="hidden flex-1 overflow-y-auto lg:block">
				{#if selected}
					<div class="p-6">
						<div class="flex items-start gap-4">
							<div class="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-muted shadow-md">
								<Users size={24} class="text-muted-foreground" />
							</div>
							<div class="min-w-0 flex-1">
								<h2 class="text-lg font-semibold text-foreground">
									{selected.readableName || selected.groupname}
								</h2>
								<p class="mt-0.5 text-sm text-muted-foreground">{selected.groupname}</p>
							</div>
							{#if canEdit}
								<button
									type="button"
									class="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
									onclick={() => openEdit(selected.groupname)}
								>
									{i18n.t('ADMIN_NEXT.EDIT')}
									<DirectionalIcon name="chevron-forward" size={14} />
								</button>
							{/if}
						</div>

						<div class="mt-6 grid grid-cols-2 gap-4">
							{#if selected.description}
								<div class="col-span-2">
									<dt class="text-xs font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.GROUPS.DESCRIPTION')}</dt>
									<dd class="mt-0.5 text-sm text-foreground">{selected.description}</dd>
								</div>
							{/if}
							<div>
								<dt class="text-xs font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.PAGES.HEADER_STATUS')}</dt>
								<dd class="mt-0.5 text-sm">
									<span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
										{selected.enabled
											? 'bg-green-500/15 text-green-600 dark:text-green-400'
											: 'bg-red-500/15 text-red-600 dark:text-red-400'}">
										{selected.enabled ? i18n.t('ADMIN_NEXT.USERS_TABLE.ENABLED') : i18n.t('ADMIN_NEXT.USERS_TABLE.DISABLED')}
									</span>
								</dd>
							</div>
						</div>

						{#if flattenAccess(selected.access ?? {}).length}
							<div class="mt-5">
								<dt class="text-xs font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.USERS.PERMISSIONS')}</dt>
								<dd class="mt-1.5 flex flex-wrap gap-1.5">
									{#each flattenAccess(selected.access ?? {}) as perm}
										<span class="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">
											<span class="text-foreground">{perm}</span>
										</span>
									{/each}
								</dd>
							</div>
						{/if}
					</div>
				{:else}
					<div class="flex h-full items-center justify-center text-sm text-muted-foreground">
						{i18n.t('ADMIN_NEXT.GROUPS.SELECT_A_GROUP_TO_VIEW_DETAILS')}
					</div>
				{/if}
			</div>
		</div>
		{/if}
	{/if}
</div>

<ConfirmModal
	open={confirmDeleteOpen}
	title={i18n.t('ADMIN_NEXT.GROUPS.DELETE_GROUP')}
	message={pendingDelete ? i18n.t('ADMIN_NEXT.GROUPS.CONFIRM_DELETE_GROUP', { name: pendingDelete }) : ''}
	confirmLabel={i18n.t('ADMIN_NEXT.DELETE')}
	variant="destructive"
	onconfirm={confirmDelete}
	oncancel={() => { confirmDeleteOpen = false; pendingDelete = null; }}
/>
