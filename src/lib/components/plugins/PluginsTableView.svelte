<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import type { PluginInfo } from '$lib/api/endpoints/gpm';
	import { faIconClass, isFirstParty } from '$lib/utils/gpm';
	import { Puzzle, ArrowUpCircle, BadgeCheck, Loader2, CornerDownRight, ArrowUp, ArrowDown, Settings, Trash2 } from 'lucide-svelte';

	interface Props {
		plugins: PluginInfo[];
		canEdit: boolean;
		togglingSlug: string | null;
		updatingSlug: string | null;
		updatingAll: boolean;
		removingSlug: string | null;
		protectedSlugs: Set<string>;
		onConfigure: (slug: string) => void;
		onToggle: (plugin: PluginInfo, e: Event) => void;
		onUpdate: (plugin: PluginInfo, e: Event) => void;
		onRemove?: (plugin: PluginInfo, e: Event) => void;
	}

	let {
		plugins,
		canEdit,
		togglingSlug,
		updatingSlug,
		updatingAll,
		removingSlug,
		protectedSlugs,
		onConfigure,
		onToggle,
		onUpdate,
		onRemove,
	}: Props = $props();

	type SortKey = 'name' | 'author' | 'version' | 'enabled';
	let sortKey = $state<SortKey>('name');
	let sortDir = $state<'asc' | 'desc'>('asc');

	function toggleSort(key: SortKey) {
		if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		else { sortKey = key; sortDir = 'asc'; }
	}

	function compareValues(a: PluginInfo, b: PluginInfo, key: SortKey): number {
		switch (key) {
			case 'author':  return (a.author?.name ?? '').localeCompare(b.author?.name ?? '');
			case 'version': return (a.version ?? '').localeCompare(b.version ?? '', undefined, { numeric: true });
			case 'enabled': return (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0);
			default:        return (a.name ?? a.slug).localeCompare(b.name ?? b.slug);
		}
	}

	const sorted = $derived.by(() => {
		const list = [...plugins];
		list.sort((a, b) => {
			const cmp = compareValues(a, b, sortKey);
			return sortDir === 'asc' ? cmp : -cmp;
		});
		return list;
	});
</script>

<div class="overflow-x-auto">
	<table class="w-full text-sm">
		<thead class="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
			<tr>
				<th class="px-4 py-2 text-start font-medium">
					<button class="inline-flex items-center gap-1 hover:text-foreground" onclick={() => toggleSort('name')}>
						{i18n.t('ADMIN_NEXT.PLUGINS_TABLE.NAME')}
						{#if sortKey === 'name'}{#if sortDir === 'asc'}<ArrowUp size={11} />{:else}<ArrowDown size={11} />{/if}{/if}
					</button>
				</th>
				<th class="px-4 py-2 text-start font-medium">
					<button class="inline-flex items-center gap-1 hover:text-foreground" onclick={() => toggleSort('author')}>
						{i18n.t('ADMIN_NEXT.AUTHOR')}
						{#if sortKey === 'author'}{#if sortDir === 'asc'}<ArrowUp size={11} />{:else}<ArrowDown size={11} />{/if}{/if}
					</button>
				</th>
				<th class="px-4 py-2 text-start font-medium">
					<button class="inline-flex items-center gap-1 hover:text-foreground" onclick={() => toggleSort('version')}>
						{i18n.t('ADMIN_NEXT.PLUGINS_TABLE.VERSION')}
						{#if sortKey === 'version'}{#if sortDir === 'asc'}<ArrowUp size={11} />{:else}<ArrowDown size={11} />{/if}{/if}
					</button>
				</th>
				<th class="px-4 py-2 text-start font-medium">
					<button class="inline-flex items-center gap-1 hover:text-foreground" onclick={() => toggleSort('enabled')}>
						{i18n.t('ADMIN_NEXT.PAGES.HEADER_STATUS')}
						{#if sortKey === 'enabled'}{#if sortDir === 'asc'}<ArrowUp size={11} />{:else}<ArrowDown size={11} />{/if}{/if}
					</button>
				</th>
				<th class="w-32 px-4 py-2 text-end font-medium">{i18n.t('ADMIN_NEXT.USERS_TABLE.ACTIONS')}</th>
			</tr>
		</thead>
		<tbody>
			{#each sorted as plugin (plugin.slug)}
				<tr class="border-b border-border transition-colors hover:bg-muted/30">
					<td class="px-4 py-2">
						<button class="inline-flex items-center gap-2 text-start text-primary hover:underline" onclick={() => onConfigure(plugin.slug)}>
							<span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md {plugin.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}">
								{#if plugin.icon}
									<i class="{faIconClass(plugin.icon)} text-xs"></i>
								{:else}
									<Puzzle size={13} />
								{/if}
							</span>
							<span class="font-medium">{plugin.name}</span>
							{#if isFirstParty(plugin.author)}
								<BadgeCheck size={13} class="text-purple-500" />
							{/if}
							{#if plugin.premium}
								<span class="rounded-full bg-red-500/15 px-1.5 py-0.5 text-[0.625rem] font-medium text-red-600 dark:text-red-400">{i18n.t('ADMIN_NEXT.PREMIUM')}</span>
							{/if}
							{#if plugin.is_symlink}
								<CornerDownRight size={12} class="text-muted-foreground/60" />
							{/if}
						</button>
					</td>
					<td class="px-4 py-2 text-muted-foreground">{plugin.author?.name ?? '—'}</td>
					<td class="px-4 py-2 font-mono text-xs">
						{plugin.version}
						{#if plugin.updatable}
							<span class="ms-1 inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[0.625rem] font-medium text-amber-600 dark:text-amber-400">
								<ArrowUpCircle size={10} />
								{plugin.available_version}
							</span>
						{/if}
					</td>
					<td class="px-4 py-2">
						<button
							type="button"
							class="rounded-full px-2.5 py-0.5 text-[0.625rem] font-medium transition-colors
								{plugin.enabled
									? 'bg-green-500/15 text-green-600 hover:bg-green-500/25 dark:text-green-400'
									: 'bg-muted text-muted-foreground hover:bg-muted/80'}"
							onclick={(e) => onToggle(plugin, e)}
							disabled={!canEdit || togglingSlug === plugin.slug || (plugin.enabled && protectedSlugs.has(plugin.slug))}
							title={plugin.enabled && protectedSlugs.has(plugin.slug) ? i18n.t('ADMIN_NEXT.PLUGINS_TABLE.PROTECTED_PLUGIN') : ''}
						>
							{#if togglingSlug === plugin.slug}
								<Loader2 size={10} class="inline animate-spin" />
							{:else}
								{plugin.enabled ? i18n.t('ADMIN_NEXT.USERS_TABLE.ENABLED') : i18n.t('ADMIN_NEXT.USERS_TABLE.DISABLED')}
							{/if}
						</button>
					</td>
					<td class="px-4 py-2 text-end">
						<div class="inline-flex items-center gap-1">
							{#if plugin.updatable && canEdit}
								<button
									class="rounded p-1 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
									aria-label={i18n.t('ADMIN_NEXT.UPDATE_TO_VERSION', { version: plugin.available_version ?? '' })}
									title={i18n.t('ADMIN_NEXT.UPDATE_TO_VERSION', { version: plugin.available_version ?? '' })}
									onclick={(e) => onUpdate(plugin, e)}
									disabled={updatingSlug === plugin.slug || updatingAll}
								>
									{#if updatingSlug === plugin.slug}
										<Loader2 size={14} class="animate-spin" />
									{:else}
										<ArrowUpCircle size={14} />
									{/if}
								</button>
							{/if}
							<button
								class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
								aria-label={i18n.t('ADMIN_NEXT.PLUGINS.CONFIGURE')}
								title={i18n.t('ADMIN_NEXT.PLUGINS.CONFIGURE')}
								onclick={() => onConfigure(plugin.slug)}
							>
								<Settings size={14} />
							</button>
							{#if onRemove && canEdit}
								<button
									class="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
									aria-label={i18n.t('ADMIN_NEXT.DELETE')}
									title={i18n.t('ADMIN_NEXT.DELETE')}
									onclick={(e) => onRemove(plugin, e)}
									disabled={removingSlug === plugin.slug}
								>
									{#if removingSlug === plugin.slug}
										<Loader2 size={14} class="animate-spin" />
									{:else}
										<Trash2 size={14} />
									{/if}
								</button>
							{/if}
						</div>
					</td>
				</tr>
			{/each}
			{#if sorted.length === 0}
				<tr>
					<td colspan="5" class="px-4 py-8 text-center text-sm text-muted-foreground">
						{i18n.t('ADMIN_NEXT.PLUGINS_TABLE.NO_PLUGINS')}
					</td>
				</tr>
			{/if}
		</tbody>
	</table>
</div>
