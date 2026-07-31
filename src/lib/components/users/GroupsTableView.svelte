<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { base } from '$app/paths';
	import { linkClick } from '$lib/utils/navLink';
	import type { GroupInfo } from '$lib/api/endpoints/groups';
	import { Pencil, Trash2, ArrowUp, ArrowDown } from 'lucide-svelte';

	interface Props {
		groups: GroupInfo[];
		canEdit: boolean;
		onEdit: (name: string) => void;
		onDelete?: (name: string) => void;
	}

	let { groups, canEdit, onEdit, onDelete }: Props = $props();

	type SortKey = 'groupname' | 'readableName' | 'description';
	let sortKey = $state<SortKey>('groupname');
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
		const list = [...groups];
		list.sort((a, b) => {
			const av = String(a[sortKey] ?? '').toLowerCase();
			const bv = String(b[sortKey] ?? '').toLowerCase();
			const cmp = av.localeCompare(bv);
			return sortDir === 'asc' ? cmp : -cmp;
		});
		return list;
	});
</script>

<div class="overflow-x-auto">
	<table class="w-full text-sm">
		<thead class="border-b border-border bg-muted/30 text-xs tracking-wide text-muted-foreground">
			<tr>
				<th class="px-4 py-2 text-start font-medium">
					<button class="inline-flex items-center gap-1 hover:text-foreground" onclick={() => toggleSort('groupname')}>
						{i18n.t('ADMIN_NEXT.GROUPS.GROUP_NAME')}
						{#if sortKey === 'groupname'}
							{#if sortDir === 'asc'}<ArrowUp size={11} />{:else}<ArrowDown size={11} />{/if}
						{/if}
					</button>
				</th>
				<th class="px-4 py-2 text-start font-medium">
					<button class="inline-flex items-center gap-1 hover:text-foreground" onclick={() => toggleSort('readableName')}>
						{i18n.t('ADMIN_NEXT.GROUPS.DISPLAY_NAME')}
						{#if sortKey === 'readableName'}
							{#if sortDir === 'asc'}<ArrowUp size={11} />{:else}<ArrowDown size={11} />{/if}
						{/if}
					</button>
				</th>
				<th class="px-4 py-2 text-start font-medium">
					<button class="inline-flex items-center gap-1 hover:text-foreground" onclick={() => toggleSort('description')}>
						{i18n.t('ADMIN_NEXT.GROUPS.DESCRIPTION')}
						{#if sortKey === 'description'}
							{#if sortDir === 'asc'}<ArrowUp size={11} />{:else}<ArrowDown size={11} />{/if}
						{/if}
					</button>
				</th>
				<th class="w-20 px-4 py-2 text-end font-medium">{i18n.t('ADMIN_NEXT.USERS_TABLE.ACTIONS')}</th>
			</tr>
		</thead>
		<tbody>
			{#each sorted as group (group.groupname)}
				<tr class="border-b border-border transition-colors hover:bg-muted/30">
					<td class="px-4 py-2">
						<a
							class="font-medium text-primary hover:underline"
							href="{base}/users/groups/{group.groupname}"
							onclick={linkClick(() => onEdit(group.groupname))}
						>
							{group.groupname}
						</a>
					</td>
					<td class="px-4 py-2">{group.readableName || '—'}</td>
					<td class="px-4 py-2 text-muted-foreground">{group.description || '—'}</td>
					<td class="px-4 py-2 text-end">
						<div class="inline-flex items-center gap-1">
							{#if canEdit}
								<button class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
									aria-label={i18n.t('ADMIN_NEXT.USERS_TABLE.EDIT')}
									onclick={() => onEdit(group.groupname)}>
									<Pencil size={14} />
								</button>
							{/if}
							{#if canEdit && onDelete}
								<button class="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
									aria-label={i18n.t('ADMIN_NEXT.USERS_TABLE.DELETE')}
									onclick={() => onDelete?.(group.groupname)}>
									<Trash2 size={14} />
								</button>
							{/if}
						</div>
					</td>
				</tr>
			{/each}
			{#if sorted.length === 0}
				<tr>
					<td colspan="4" class="px-4 py-8 text-center text-sm text-muted-foreground">
						{i18n.t('ADMIN_NEXT.GROUPS.NO_GROUPS')}
					</td>
				</tr>
			{/if}
		</tbody>
	</table>
</div>
