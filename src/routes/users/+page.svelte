<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { getUsers, type UserInfo, type UsersPage } from '$lib/api/endpoints/users';
	import { invalidations } from '$lib/stores/invalidation.svelte';
	import { onMount } from 'svelte';
	import { resolveAvatarUrl } from '$lib/utils/avatar';
	import { Button } from '$lib/components/ui/button';
	import StickyHeader from '$lib/components/ui/StickyHeader.svelte';
	import { toast } from 'svelte-sonner';
	import {
		Search, User, Plus, Loader2,
		Mail, MailPlus, Shield, ShieldCheck, ShieldOff, BadgeCheck,
		LayoutGrid, Table as TableIcon, Pencil, Trash2
	} from 'lucide-svelte';
	import DirectionalIcon from '$lib/components/ui/DirectionalIcon.svelte';
	import UsersTabNav from '$lib/components/users/UsersTabNav.svelte';
	import UsersTableView from '$lib/components/users/UsersTableView.svelte';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import { deleteUser, updateUser } from '$lib/api/endpoints/users';
	import { prefs } from '$lib/stores/preferences.svelte';
	import { canWrite } from '$lib/utils/permissions';

	const canEditUsers = $derived(canWrite('users'));

	let data = $state<UsersPage | null>(null);
	let loading = $state(true);
	let search = $state('');
	let currentPage = $state(1);
	let selectedUsername = $state<string | null>(null);
	let pendingDelete = $state<string | null>(null);
	let confirmDeleteOpen = $state(false);
	const perPage = 20;

	const filtered = $derived.by(() => {
		if (!data) return [];
		let list = data.users;
		if (search) {
			const q = search.toLowerCase();
			list = list.filter(
				(u) =>
					u.username.toLowerCase().includes(q) ||
					(u.fullname ?? '').toLowerCase().includes(q) ||
					(u.email ?? '').toLowerCase().includes(q) ||
					(u.title ?? '').toLowerCase().includes(q),
			);
		}
		return list;
	});

	const selectedUser = $derived(
		selectedUsername ? data?.users.find((u) => u.username === selectedUsername) ?? null : null,
	);

	async function loadUsers(page = 1) {
		loading = true;
		try {
			data = await getUsers(page, perPage);
			currentPage = data.page;
			if (!selectedUsername && data.users.length > 0) {
				selectedUsername = data.users[0].username;
			}
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.USERS.FAILED_TO_LOAD_USERS'));
		} finally {
			loading = false;
		}
	}

	// Below the lg breakpoint the detail panel is hidden, so a single tap
	// would otherwise do nothing visible. Navigate straight to edit instead.
	const hasDetailPanel = () =>
		typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;

	function selectUser(username: string) {
		if (!hasDetailPanel()) {
			openUserEdit(username);
			return;
		}
		selectedUsername = username;
	}

	function openUserEdit(username: string) {
		goto(`${base}/users/${username}`);
	}

	function requestDelete(username: string) {
		pendingDelete = username;
		confirmDeleteOpen = true;
	}

	async function confirmDelete() {
		const username = pendingDelete;
		confirmDeleteOpen = false;
		pendingDelete = null;
		if (!username) return;
		try {
			await deleteUser(username);
			toast.success(i18n.t('ADMIN_NEXT.TOASTS.USER_DELETED', { username }));
			loadUsers(currentPage);
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.TOASTS.USER_DELETE_FAILED', { username }));
		}
	}

	let togglingUsername = $state<string | null>(null);

	async function handleToggleState(user: UserInfo) {
		const next = user.state === 'enabled' ? 'disabled' : 'enabled';
		togglingUsername = user.username;
		try {
			await updateUser(user.username, { state: next });
			toast.success(
				next === 'enabled'
					? i18n.t('ADMIN_NEXT.TOASTS.USER_ENABLED', { username: user.username })
					: i18n.t('ADMIN_NEXT.TOASTS.USER_DISABLED', { username: user.username })
			);
			loadUsers(currentPage);
		} catch (err) {
			const detail = err instanceof Error ? err.message : String(err);
			toast.error(i18n.t('ADMIN_NEXT.TOASTS.USER_STATE_FAILED', { username: user.username, detail }));
		} finally {
			togglingUsername = null;
		}
	}

	function getInitials(user: UserInfo): string {
		if (user.fullname) {
			return user.fullname
				.split(' ')
				.map((n) => n[0])
				.join('')
				.toUpperCase()
				.slice(0, 2);
		}
		return user.username.slice(0, 2).toUpperCase();
	}

	function isSuperAdmin(user: UserInfo): boolean {
		const access = user.access as Record<string, unknown>;
		const api = access?.api as Record<string, unknown> | undefined;
		return api?.super === true;
	}

	function formatDate(iso: string | null): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
		});
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

	$effect(() => {
		// Callers without api.users.read get an auto-filtered listing (just
		// their own row) from the API, so the list page renders for everyone.
		loadUsers();
	});

	// Refetch when any user mutation happens elsewhere or on tab refocus.
	onMount(() => {
		const unsubUsers = invalidations.subscribe('users:*', () => loadUsers(currentPage));
		const unsubFocus = invalidations.subscribe('*:focus', () => loadUsers(currentPage));
		return () => { unsubUsers(); unsubFocus(); };
	});
</script>

<svelte:head>
	<title>{i18n.t('ADMIN_NEXT.USERS.USERS_GRAV_ADMIN')}</title>
</svelte:head>

<div class="flex h-full flex-col">
	<!-- Header -->
	<StickyHeader noBorder>
		{#snippet children({ scrolled })}
			<div class="px-6 transition-[padding] duration-200 {scrolled ? 'py-2' : 'pt-6 pb-3'}">
				<div class="flex items-center justify-between {scrolled ? 'min-h-6' : 'min-h-8'}">
					<div>
						<h1 class="font-semibold tracking-tight text-foreground transition-[font-size] duration-200 {scrolled ? 'text-sm' : 'text-xl'}">Users</h1>
						{#if !scrolled && data}
							<p class="mt-0.5 text-xs text-muted-foreground">{data.total} account{data.total !== 1 ? 's' : ''}</p>
						{/if}
					</div>
					{#if canEditUsers}
					<div class="flex items-center gap-2">
						<Button variant="outline" size="sm" onclick={() => goto(`${base}/users/invite`)}>
							<MailPlus size={14} class="me-1.5" />
							{i18n.t('ADMIN_NEXT.INVITATIONS.INVITE')}
						</Button>
						<Button size="sm" onclick={() => goto(`${base}/users/new`)}>
							<Plus size={14} />
							{i18n.t('ADMIN_NEXT.USERS.ADD_USER')}
						</Button>
					</div>
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
		<!-- Toolbar -->
		<div class="flex items-center gap-3 border-b border-border px-4 py-2">
			<div class="relative flex-1">
				<Search size={14} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
				<input
					type="text"
					class="h-8 w-full rounded-md border border-input bg-muted/50 ps-9 pe-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
					placeholder={i18n.t('ADMIN_NEXT.USERS.SEARCH_USERS')}
					bind:value={search}
				/>
			</div>
			<div class="inline-flex rounded-md border border-border shadow-sm">
				<button
					class="inline-flex h-8 items-center gap-1.5 px-3 text-[0.75rem] font-medium transition-colors first:rounded-l-md last:rounded-r-md
						{prefs.usersViewMode === 'cards'
							? 'bg-accent text-accent-foreground'
							: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}"
					onclick={() => prefs.usersViewMode = 'cards'}
					title={i18n.t('ADMIN_NEXT.USERS_TABLE.CARDS')}
				>
					<LayoutGrid size={14} />
					<span class="hidden sm:inline">{i18n.t('ADMIN_NEXT.USERS_TABLE.CARDS')}</span>
				</button>
				<button
					class="inline-flex h-8 items-center gap-1.5 px-3 text-[0.75rem] font-medium transition-colors first:rounded-l-md last:rounded-r-md
						{prefs.usersViewMode === 'table'
							? 'bg-accent text-accent-foreground'
							: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}"
					onclick={() => prefs.usersViewMode = 'table'}
					title={i18n.t('ADMIN_NEXT.USERS_TABLE.TABLE')}
				>
					<TableIcon size={14} />
					<span class="hidden sm:inline">{i18n.t('ADMIN_NEXT.USERS_TABLE.TABLE')}</span>
				</button>
			</div>
		</div>

		{#if prefs.usersViewMode === 'table'}
			<div class="flex-1 overflow-y-auto">
				<UsersTableView
					users={filtered}
					canEdit={canEditUsers}
					{togglingUsername}
					onEdit={openUserEdit}
					onDelete={canEditUsers ? requestDelete : undefined}
					onToggleState={canEditUsers ? handleToggleState : undefined}
				/>
				{#if data.totalPages > 1}
					<div class="flex items-center justify-between border-t border-border px-4 py-2">
						<span class="text-xs text-muted-foreground">
							{i18n.t('ADMIN_NEXT.PAGINATION.PAGE_OF', { current: currentPage, total: data.totalPages })}
						</span>
						<div class="flex items-center gap-1">
							<Button variant="outline" size="icon" disabled={currentPage <= 1} onclick={() => loadUsers(currentPage - 1)} class="h-7 w-7">
								<DirectionalIcon name="chevron-back" size={14} />
							</Button>
							<Button variant="outline" size="icon" disabled={currentPage >= data.totalPages} onclick={() => loadUsers(currentPage + 1)} class="h-7 w-7">
								<DirectionalIcon name="chevron-forward" size={14} />
							</Button>
						</div>
					</div>
				{/if}
			</div>
		{:else}
		<!-- Main content: list + detail panel -->
		<div class="flex flex-1 overflow-hidden">
			<!-- User list -->
			<div class="flex w-full flex-col border-e border-border lg:w-[400px] xl:w-[440px]">
				<div class="flex-1 overflow-y-auto">
					{#each filtered as user (user.username)}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<div
							class="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-start transition-colors
								{selectedUsername === user.username ? 'bg-accent' : 'hover:bg-muted/50'}"
							onclick={() => selectUser(user.username)}
							ondblclick={() => openUserEdit(user.username)}
						>
							<!-- Avatar -->
							<img
								src={resolveAvatarUrl(user.avatar_url, user.email, user.fullname, user.username)}
								alt={user.fullname ?? user.username}
								class="h-10 w-10 shrink-0 rounded-full object-cover"
							/>

							<!-- Info -->
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-1.5">
									<span class="truncate text-sm font-medium text-foreground">
										{user.fullname || user.username}
									</span>
									{#if isSuperAdmin(user)}
										<ShieldCheck size={13} class="shrink-0 text-amber-500" />
									{/if}
								</div>
								<p class="truncate text-xs text-muted-foreground">{user.email ?? user.username}</p>
							</div>

							<!-- State toggle -->
							{#if canEditUsers}
								<button
									type="button"
									class="shrink-0 rounded-full px-2.5 py-0.5 text-[0.625rem] font-medium transition-colors
										{user.state === 'enabled'
											? 'bg-green-500/15 text-green-600 hover:bg-green-500/25 dark:text-green-400'
											: 'bg-red-500/15 text-red-600 hover:bg-red-500/25 dark:text-red-400'}"
									onclick={(e) => { e.stopPropagation(); handleToggleState(user); }}
									disabled={togglingUsername === user.username}
									title={user.state === 'enabled' ? i18n.t('ADMIN_NEXT.USERS_TABLE.DISABLED') : i18n.t('ADMIN_NEXT.USERS_TABLE.ENABLED')}
								>
									{#if togglingUsername === user.username}
										<Loader2 size={10} class="inline animate-spin" />
									{:else}
										{user.state === 'enabled' ? i18n.t('ADMIN_NEXT.USERS_TABLE.ENABLED') : i18n.t('ADMIN_NEXT.USERS_TABLE.DISABLED')}
									{/if}
								</button>
							{:else}
								<span class="shrink-0 rounded-full px-2.5 py-0.5 text-[0.625rem] font-medium
									{user.state === 'enabled'
										? 'bg-green-500/15 text-green-600 dark:text-green-400'
										: 'bg-red-500/15 text-red-600 dark:text-red-400'}">
									{user.state === 'enabled' ? i18n.t('ADMIN_NEXT.USERS_TABLE.ENABLED') : i18n.t('ADMIN_NEXT.USERS_TABLE.DISABLED')}
								</span>
							{/if}

							{#if canEditUsers}
								<button
									type="button"
									class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
									onclick={(e) => { e.stopPropagation(); openUserEdit(user.username); }}
									aria-label={i18n.t('ADMIN_NEXT.USERS_TABLE.EDIT')}
									title={i18n.t('ADMIN_NEXT.USERS_TABLE.EDIT')}
								>
									<Pencil size={12} />
								</button>
								<button
									type="button"
									class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
									onclick={(e) => { e.stopPropagation(); requestDelete(user.username); }}
									aria-label={i18n.t('ADMIN_NEXT.USERS_TABLE.DELETE')}
									title={i18n.t('ADMIN_NEXT.USERS_TABLE.DELETE')}
								>
									<Trash2 size={12} />
								</button>
							{/if}
						</div>
					{/each}

					{#if filtered.length === 0}
						<div class="px-4 py-8 text-center text-sm text-muted-foreground">
							{search ? 'No users match your search' : 'No users found'}
						</div>
					{/if}
				</div>

				<!-- Pagination -->
				{#if data.totalPages > 1}
					<div class="flex items-center justify-between border-t border-border px-4 py-2">
						<span class="text-xs text-muted-foreground">
							Page {currentPage} of {data.totalPages}
						</span>
						<div class="flex items-center gap-1">
							<Button
								variant="outline"
								size="icon"
								disabled={currentPage <= 1}
								onclick={() => loadUsers(currentPage - 1)}
								class="h-7 w-7"
							>
								<DirectionalIcon name="chevron-back" size={14} />
							</Button>
							<Button
								variant="outline"
								size="icon"
								disabled={currentPage >= data.totalPages}
								onclick={() => loadUsers(currentPage + 1)}
								class="h-7 w-7"
							>
								<DirectionalIcon name="chevron-forward" size={14} />
							</Button>
						</div>
					</div>
				{/if}
			</div>

			<!-- Detail panel -->
			<div class="hidden flex-1 overflow-y-auto lg:block">
				{#if selectedUser}
					<div class="p-6">
						<!-- User header -->
						<div class="flex items-start gap-4">
							<img
								src={resolveAvatarUrl(selectedUser.avatar_url, selectedUser.email, selectedUser.fullname, selectedUser.username)}
								alt={selectedUser.fullname ?? selectedUser.username}
								class="h-16 w-16 shrink-0 rounded-full object-cover shadow-md"
							/>
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<h2 class="text-lg font-semibold text-foreground">
										{selectedUser.fullname || selectedUser.username}
									</h2>
									{#if isSuperAdmin(selectedUser)}
										<span class="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
											{i18n.t('ADMIN_NEXT.USERS.SUPER_ADMIN')}
										</span>
									{/if}
								</div>
								<p class="mt-0.5 text-sm text-muted-foreground">@{selectedUser.username}</p>
							</div>
							<div class="flex items-center gap-2">
								{#if canEditUsers}
									<button
										type="button"
										class="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium transition-colors disabled:opacity-50
											{selectedUser.state === 'enabled'
												? 'text-green-600 hover:bg-green-500/10 dark:text-green-400'
												: 'text-red-600 hover:bg-red-500/10 dark:text-red-400'}"
										onclick={() => handleToggleState(selectedUser)}
										disabled={togglingUsername === selectedUser.username}
									>
										{#if togglingUsername === selectedUser.username}
											<Loader2 size={13} class="animate-spin" />
										{:else if selectedUser.state === 'enabled'}
											<ShieldCheck size={13} />
										{:else}
											<ShieldOff size={13} />
										{/if}
										{selectedUser.state === 'enabled' ? i18n.t('ADMIN_NEXT.USERS_TABLE.ENABLED') : i18n.t('ADMIN_NEXT.USERS_TABLE.DISABLED')}
									</button>
									<button
										type="button"
										class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
										onclick={() => requestDelete(selectedUser.username)}
										aria-label={i18n.t('ADMIN_NEXT.USERS_TABLE.DELETE')}
										title={i18n.t('ADMIN_NEXT.USERS_TABLE.DELETE')}
									>
										<Trash2 size={14} />
									</button>
								{/if}
								<button
									type="button"
									class="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
									onclick={() => openUserEdit(selectedUser.username)}
								>
									Edit
									<DirectionalIcon name="chevron-forward" size={14} />
								</button>
							</div>
						</div>

						<!-- Metadata grid -->
						<div class="mt-6 grid grid-cols-2 gap-4">
							{#if selectedUser.email}
								<div>
									<dt class="text-xs font-medium text-muted-foreground">Email</dt>
									<dd class="mt-0.5 flex items-center gap-1 text-sm text-foreground">
										<Mail size={12} class="text-muted-foreground" />
										{selectedUser.email}
									</dd>
								</div>
							{/if}

							{#if selectedUser.title}
								<div>
									<dt class="text-xs font-medium text-muted-foreground">Title</dt>
									<dd class="mt-0.5 text-sm text-foreground">{selectedUser.title}</dd>
								</div>
							{/if}

							<div>
								<dt class="text-xs font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.PAGES.HEADER_STATUS')}</dt>
								<dd class="mt-0.5 text-sm">
									<span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
										{selectedUser.state === 'enabled'
											? 'bg-green-500/15 text-green-600 dark:text-green-400'
											: 'bg-red-500/15 text-red-600 dark:text-red-400'}">
										{selectedUser.state === 'enabled' ? 'Enabled' : 'Disabled'}
									</span>
								</dd>
							</div>

							<div>
								<dt class="text-xs font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.USERS.CREATED')}</dt>
								<dd class="mt-0.5 text-sm text-foreground">{formatDate(selectedUser.created)}</dd>
							</div>
						</div>

						<!-- Permissions summary -->
						{#if flattenAccess(selectedUser.access).length}
							<div class="mt-5">
								<dt class="text-xs font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.USERS.PERMISSIONS')}</dt>
								<dd class="mt-1.5 flex flex-wrap gap-1.5">
									{#each flattenAccess(selectedUser.access) as perm}
										<span class="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">
											<Shield size={10} class="text-muted-foreground" />
											<span class="text-foreground">{perm}</span>
										</span>
									{/each}
								</dd>
							</div>
						{/if}
					</div>
				{:else}
					<div class="flex h-full items-center justify-center text-sm text-muted-foreground">
						{i18n.t('ADMIN_NEXT.USERS.SELECT_A_USER_TO_VIEW_DETAILS')}
					</div>
				{/if}
			</div>
		</div>
		{/if}
	{/if}
</div>

<ConfirmModal
	open={confirmDeleteOpen}
	title={i18n.t('ADMIN_NEXT.USERS.DELETE_USER')}
	message={pendingDelete ? i18n.t('ADMIN_NEXT.USERS.CONFIRM_DELETE_USER', { username: pendingDelete }) : ''}
	confirmLabel={i18n.t('ADMIN_NEXT.DELETE')}
	variant="destructive"
	onconfirm={confirmDelete}
	oncancel={() => { confirmDeleteOpen = false; pendingDelete = null; }}
/>
