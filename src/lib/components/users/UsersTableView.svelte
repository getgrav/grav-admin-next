<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import type { UserInfo, UserColumn } from '$lib/api/endpoints/users';
	import type { FlexDetailConfig } from '$lib/api/endpoints/flexObjects';
	import { resolveAvatarUrl } from '$lib/utils/avatar';
	import { Pencil, Trash2, Shield, ShieldCheck, ArrowUp, ArrowDown, Loader2, ChevronDown, ChevronRight } from 'lucide-svelte';
	import { flattenAccess, isSuperAdmin, hasBackendAccess } from '$lib/utils/user-access';
	import FlexDetailTable from '$lib/components/flex-objects/FlexDetailTable.svelte';
	import UserColumnCell from '$lib/components/users/UserColumnCell.svelte';

	interface Props {
		users: UserInfo[];
		canEdit: boolean;
		detail?: FlexDetailConfig | null;
		/** Plugin-declared extra columns (onApiUserListColumns). */
		columns?: UserColumn[];
		togglingUsername?: string | null;
		onEdit: (username: string) => void;
		onDelete?: (username: string) => void;
		onToggleState?: (user: UserInfo) => void;
		/** Apply a permission filter when a permission chip is clicked. */
		onFilterPermission?: (permission: string) => void;
	}

	let { users, canEdit, detail, columns = [], togglingUsername, onEdit, onDelete, onToggleState, onFilterPermission }: Props = $props();

	// How many permission chips to show before collapsing into a "+N" count.
	const MAX_CHIPS = 3;

	type SortKey = 'username' | 'email' | 'fullname' | 'state';
	let sortKey = $state<SortKey>('username');
	let sortDir = $state<'asc' | 'desc'>('asc');
	let openDetailUsername = $state<string | null>(null);

	const columnCount = $derived((detail?.enabled ? 7 : 6) + columns.length);

	function toggleSort(key: SortKey) {
		if (sortKey === key) {
			sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		} else {
			sortKey = key;
			sortDir = 'asc';
		}
	}

	const sorted = $derived.by(() => {
		const list = [...users];
		list.sort((a, b) => {
			const av = String(a[sortKey] ?? '').toLowerCase();
			const bv = String(b[sortKey] ?? '').toLowerCase();
			const cmp = av.localeCompare(bv);
			return sortDir === 'asc' ? cmp : -cmp;
		});
		return list;
	});

	function getLocalValue(user: UserInfo): string | number | boolean | null {
		const localKey = detail?.relation.local_key;
		if (!localKey) return null;
		const value = (user as unknown as Record<string, unknown>)[localKey];
		if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
			return value;
		}
		return null;
	}

	function toggleDetail(username: string) {
		openDetailUsername = openDetailUsername === username ? null : username;
	}

	function iconClass(icon: string | undefined): string {
		if (!icon) return 'fa-solid fa-list';
		if (icon.includes('fa-solid') || icon.includes('fa-regular') || icon.includes('fa-brands')) return icon;
		return `fa-solid ${icon.startsWith('fa-') ? icon : 'fa-' + icon}`;
	}
</script>

<div class="overflow-x-auto">
	<table class="w-full text-sm">
		<thead class="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
			<tr>
				{#if detail?.enabled}
					<th class="w-10 px-2 py-2 text-center font-medium" data-flex-detail-cell></th>
				{/if}
				<th class="px-4 py-2 text-start font-medium">
					<button class="inline-flex items-center gap-1 hover:text-foreground" onclick={() => toggleSort('username')}>
						{i18n.t('ADMIN_NEXT.USERS_TABLE.USERNAME')}
						{#if sortKey === 'username'}
							{#if sortDir === 'asc'}<ArrowUp size={11} />{:else}<ArrowDown size={11} />{/if}
						{/if}
					</button>
				</th>
				<th class="px-4 py-2 text-start font-medium">
					<button class="inline-flex items-center gap-1 hover:text-foreground" onclick={() => toggleSort('email')}>
						{i18n.t('ADMIN_NEXT.USERS_TABLE.EMAIL')}
						{#if sortKey === 'email'}
							{#if sortDir === 'asc'}<ArrowUp size={11} />{:else}<ArrowDown size={11} />{/if}
						{/if}
					</button>
				</th>
				<th class="px-4 py-2 text-start font-medium">
					<button class="inline-flex items-center gap-1 hover:text-foreground" onclick={() => toggleSort('fullname')}>
						{i18n.t('ADMIN_NEXT.USERS_TABLE.FULL_NAME')}
						{#if sortKey === 'fullname'}
							{#if sortDir === 'asc'}<ArrowUp size={11} />{:else}<ArrowDown size={11} />{/if}
						{/if}
					</button>
				</th>
				<th class="px-4 py-2 text-start font-medium">
					<button class="inline-flex items-center gap-1 hover:text-foreground" onclick={() => toggleSort('state')}>
						{i18n.t('ADMIN_NEXT.USERS_TABLE.STATUS')}
						{#if sortKey === 'state'}
							{#if sortDir === 'asc'}<ArrowUp size={11} />{:else}<ArrowDown size={11} />{/if}
						{/if}
					</button>
				</th>
				<th class="px-4 py-2 text-start font-medium">{i18n.t('ADMIN_NEXT.USERS_TABLE.PERMISSIONS')}</th>
				{#each columns as column (column.id)}
					<th class="px-4 py-2 text-start font-medium">{column.label}</th>
				{/each}
				<th class="w-20 px-4 py-2 text-end font-medium">{i18n.t('ADMIN_NEXT.USERS_TABLE.ACTIONS')}</th>
			</tr>
		</thead>
		<tbody>
			{#each sorted as user (user.username)}
				{@const perms = flattenAccess(user.access)}
				{@const localValue = getLocalValue(user)}
				<tr class="border-b border-border transition-colors hover:bg-muted/30">
					{#if detail?.enabled}
						<td class="w-10 px-2 py-2 text-center" data-flex-detail-cell>
							{#if localValue !== null}
								<button
									type="button"
									class="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
									aria-label={detail.label ?? detail.title ?? detail.relation.type}
									title={detail.label ?? detail.title ?? detail.relation.type}
									onclick={() => toggleDetail(user.username)}
								>
									<span class="relative inline-flex h-4 w-4 items-center justify-center">
										<i class="{iconClass(detail.icon)} text-[0.8125rem]"></i>
										<span class="absolute -bottom-1 -end-1 rounded-full bg-background">
											{#if openDetailUsername === user.username}
												<ChevronDown size={9} />
											{:else}
												<ChevronRight size={9} class="flip-rtl" />
											{/if}
										</span>
									</span>
								</button>
							{/if}
						</td>
					{/if}
					<td class="px-4 py-2">
						<button class="inline-flex items-center gap-2 text-primary hover:underline" onclick={() => onEdit(user.username)}>
							<img
								src={resolveAvatarUrl(user.avatar_url, user.email, user.fullname, user.username)}
								alt={user.fullname ?? user.username}
								class="h-6 w-6 rounded-full object-cover"
							/>
							<span class="font-medium">{user.username}</span>
							{#if isSuperAdmin(user)}
								<span class="inline-flex" title={i18n.t('ADMIN_NEXT.USERS.SUPER_ADMIN')}>
									<ShieldCheck size={12} class="text-amber-500" />
								</span>
							{:else if hasBackendAccess(user)}
								<span class="inline-flex" title={i18n.t('ADMIN_NEXT.USERS_FILTER.BACKEND_ACCESS')}>
									<Shield size={12} class="text-sky-500" />
								</span>
							{/if}
						</button>
					</td>
					<td class="px-4 py-2 text-muted-foreground">{user.email ?? '—'}</td>
					<td class="px-4 py-2">{user.fullname ?? '—'}</td>
					<td class="px-4 py-2">
						{#if onToggleState && canEdit}
							<button
								type="button"
								class="rounded-full px-2.5 py-0.5 text-[0.625rem] font-medium transition-colors
									{user.state === 'enabled'
										? 'bg-green-500/15 text-green-600 hover:bg-green-500/25 dark:text-green-400'
										: 'bg-red-500/15 text-red-600 hover:bg-red-500/25 dark:text-red-400'}"
								onclick={() => onToggleState(user)}
								disabled={togglingUsername === user.username}
							>
								{#if togglingUsername === user.username}
									<Loader2 size={10} class="inline animate-spin" />
								{:else}
									{user.state === 'enabled' ? i18n.t('ADMIN_NEXT.USERS_TABLE.ENABLED') : i18n.t('ADMIN_NEXT.USERS_TABLE.DISABLED')}
								{/if}
							</button>
						{:else}
							<span class="inline-flex items-center rounded-full px-2 py-0.5 text-[0.625rem] font-medium
								{user.state === 'enabled'
									? 'bg-green-500/15 text-green-600 dark:text-green-400'
									: 'bg-red-500/15 text-red-600 dark:text-red-400'}">
								{user.state === 'enabled' ? i18n.t('ADMIN_NEXT.USERS_TABLE.ENABLED') : i18n.t('ADMIN_NEXT.USERS_TABLE.DISABLED')}
							</span>
						{/if}
					</td>
					<td class="px-4 py-2">
						<div class="flex flex-wrap items-center gap-1">
							{#if isSuperAdmin(user)}
								<span class="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.625rem] font-medium text-amber-600 dark:text-amber-400">
									<ShieldCheck size={10} />
									{i18n.t('ADMIN_NEXT.USERS.SUPER_ADMIN')}
								</span>
							{:else if perms.length === 0}
								<span class="text-xs text-muted-foreground">—</span>
							{:else}
								{#each perms.slice(0, MAX_CHIPS) as perm}
									<button
										type="button"
										class="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.6875rem] text-foreground transition-colors hover:bg-accent disabled:cursor-default disabled:hover:bg-muted"
										onclick={() => onFilterPermission?.(perm)}
										disabled={!onFilterPermission}
										title={onFilterPermission ? i18n.t('ADMIN_NEXT.USERS_FILTER.FILTER_BY_PERMISSION') : perm}
									>
										{perm}
									</button>
								{/each}
								{#if perms.length > MAX_CHIPS}
									<span class="text-[0.6875rem] text-muted-foreground" title={perms.slice(MAX_CHIPS).join(', ')}>
										+{perms.length - MAX_CHIPS}
									</span>
								{/if}
							{/if}
						</div>
					</td>
					{#each columns as column (column.id)}
						<td class="px-4 py-2 text-sm">
							<UserColumnCell
								value={user.extra?.[column.field]}
								formatter={column.formatter}
								label={column.labelField ? user.extra?.[column.labelField] : undefined}
							/>
						</td>
					{/each}
					<td class="px-4 py-2 text-end">
						<div class="inline-flex items-center gap-1">
							{#if canEdit}
								<button
									class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
									aria-label={i18n.t('ADMIN_NEXT.USERS_TABLE.EDIT')}
									onclick={() => onEdit(user.username)}
								>
									<Pencil size={14} />
								</button>
							{/if}
							{#if canEdit && onDelete}
								<button
									class="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
									aria-label={i18n.t('ADMIN_NEXT.USERS_TABLE.DELETE')}
									onclick={() => onDelete?.(user.username)}
								>
									<Trash2 size={14} />
								</button>
							{/if}
						</div>
					</td>
				</tr>
				{#if detail?.enabled && localValue !== null && openDetailUsername === user.username}
					<tr>
						<td colspan={columnCount} class="p-0">
							<FlexDetailTable {detail} {localValue} />
						</td>
					</tr>
				{/if}
			{/each}
			{#if sorted.length === 0}
				<tr>
					<td colspan={columnCount} class="px-4 py-8 text-center text-sm text-muted-foreground">
						{i18n.t('ADMIN_NEXT.USERS_TABLE.NO_USERS')}
					</td>
				</tr>
			{/if}
		</tbody>
	</table>
</div>
