<script lang="ts">
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
		Search, User, Plus, Loader2, ChevronRight, ChevronLeft,
		Mail, Shield, ShieldCheck, ShieldOff, BadgeCheck
	} from 'lucide-svelte';
	import { canWrite } from '$lib/utils/permissions';

	const canEditUsers = $derived(canWrite('users'));

	let data = $state<UsersPage | null>(null);
	let loading = $state(true);
	let search = $state('');
	let currentPage = $state(1);
	let selectedUsername = $state<string | null>(null);
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
			toast.error('Failed to load users');
		} finally {
			loading = false;
		}
	}

	function selectUser(username: string) {
		selectedUsername = username;
	}

	function openUserEdit(username: string) {
		goto(`${base}/users/${username}`);
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
		const admin = access?.admin as Record<string, unknown> | undefined;
		return admin?.super === true;
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
	<title>Users — Grav Admin</title>
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
					<Button size="sm" onclick={() => goto(`${base}/users/new`)}>
						<Plus size={14} />
						Add User
					</Button>
					{/if}
				</div>
			</div>
		{/snippet}
	</StickyHeader>

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
					class="h-8 w-full rounded-md border border-input bg-muted/50 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
					placeholder="Search users..."
					bind:value={search}
				/>
			</div>
		</div>

		<!-- Main content: list + detail panel -->
		<div class="flex flex-1 overflow-hidden">
			<!-- User list -->
			<div class="flex w-full flex-col border-r border-border lg:w-[400px] xl:w-[440px]">
				<div class="flex-1 overflow-y-auto">
					{#each filtered as user (user.username)}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<div
							class="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors
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

							<!-- State badge -->
							<span class="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium
								{user.state === 'enabled'
									? 'bg-green-500/15 text-green-600 dark:text-green-400'
									: 'bg-red-500/15 text-red-600 dark:text-red-400'}">
								{user.state === 'enabled' ? 'Enabled' : 'Disabled'}
							</span>
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
								<ChevronLeft size={14} />
							</Button>
							<Button
								variant="outline"
								size="icon"
								disabled={currentPage >= data.totalPages}
								onclick={() => loadUsers(currentPage + 1)}
								class="h-7 w-7"
							>
								<ChevronRight size={14} />
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
											Super Admin
										</span>
									{/if}
								</div>
								<p class="mt-0.5 text-sm text-muted-foreground">@{selectedUser.username}</p>
							</div>
							<button
								type="button"
								class="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
								onclick={() => openUserEdit(selectedUser.username)}
							>
								Edit
								<ChevronRight size={14} />
							</button>
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
								<dt class="text-xs font-medium text-muted-foreground">Status</dt>
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
								<dt class="text-xs font-medium text-muted-foreground">Created</dt>
								<dd class="mt-0.5 text-sm text-foreground">{formatDate(selectedUser.created)}</dd>
							</div>
						</div>

						<!-- Permissions summary -->
						{#if flattenAccess(selectedUser.access).length}
							<div class="mt-5">
								<dt class="text-xs font-medium text-muted-foreground">Permissions</dt>
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
						Select a user to view details
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
