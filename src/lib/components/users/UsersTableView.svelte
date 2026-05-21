<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import type { UserInfo } from '$lib/api/endpoints/users';
	import { resolveAvatarUrl } from '$lib/utils/avatar';
	import { Pencil, Trash2, ShieldCheck, ArrowUp, ArrowDown } from 'lucide-svelte';

	interface Props {
		users: UserInfo[];
		canEdit: boolean;
		onEdit: (username: string) => void;
		onDelete?: (username: string) => void;
	}

	let { users, canEdit, onEdit, onDelete }: Props = $props();

	type SortKey = 'username' | 'email' | 'fullname' | 'state';
	let sortKey = $state<SortKey>('username');
	let sortDir = $state<'asc' | 'desc'>('asc');

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

	function isSuperAdmin(user: UserInfo): boolean {
		const access = user.access as Record<string, unknown>;
		const admin = access?.admin as Record<string, unknown> | undefined;
		return admin?.super === true;
	}
</script>

<div class="overflow-x-auto">
	<table class="w-full text-sm">
		<thead class="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
			<tr>
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
				<th class="w-20 px-4 py-2 text-end font-medium">{i18n.t('ADMIN_NEXT.USERS_TABLE.ACTIONS')}</th>
			</tr>
		</thead>
		<tbody>
			{#each sorted as user (user.username)}
				<tr class="border-b border-border transition-colors hover:bg-muted/30">
					<td class="px-4 py-2">
						<button class="inline-flex items-center gap-2 text-primary hover:underline" onclick={() => onEdit(user.username)}>
							<img
								src={resolveAvatarUrl(user.avatar_url, user.email, user.fullname, user.username)}
								alt={user.fullname ?? user.username}
								class="h-6 w-6 rounded-full object-cover"
							/>
							<span class="font-medium">{user.username}</span>
							{#if isSuperAdmin(user)}
								<ShieldCheck size={12} class="text-amber-500" />
							{/if}
						</button>
					</td>
					<td class="px-4 py-2 text-muted-foreground">{user.email ?? '—'}</td>
					<td class="px-4 py-2">{user.fullname ?? '—'}</td>
					<td class="px-4 py-2">
						<span class="inline-flex items-center rounded-full px-2 py-0.5 text-[0.625rem] font-medium
							{user.state === 'enabled'
								? 'bg-green-500/15 text-green-600 dark:text-green-400'
								: 'bg-red-500/15 text-red-600 dark:text-red-400'}">
							{user.state === 'enabled' ? i18n.t('ADMIN_NEXT.USERS_TABLE.ENABLED') : i18n.t('ADMIN_NEXT.USERS_TABLE.DISABLED')}
						</span>
					</td>
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
			{/each}
			{#if sorted.length === 0}
				<tr>
					<td colspan="5" class="px-4 py-8 text-center text-sm text-muted-foreground">
						{i18n.t('ADMIN_NEXT.USERS_TABLE.NO_USERS')}
					</td>
				</tr>
			{/if}
		</tbody>
	</table>
</div>
