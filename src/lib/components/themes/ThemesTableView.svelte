<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import type { ThemeInfo } from '$lib/api/endpoints/gpm';
	import { faIconClass, isFirstParty } from '$lib/utils/gpm';
	import { Palette, ArrowUpCircle, BadgeCheck, Loader2, CornerDownRight, ArrowUp, ArrowDown, Settings, Check, Trash2 } from 'lucide-svelte';

	interface Props {
		themes: ThemeInfo[];
		canEdit: boolean;
		updatingSlug: string | null;
		updatingAll: boolean;
		activatingSlug: string | null;
		removingSlug: string | null;
		resolveUrl: (url: string | null | undefined) => string | null;
		onConfigure: (slug: string) => void;
		onUpdate: (theme: ThemeInfo, e: Event) => void;
		onActivate?: (theme: ThemeInfo, e: Event) => void;
		onRemove?: (theme: ThemeInfo, e: Event) => void;
	}

	let {
		themes,
		canEdit,
		updatingSlug,
		updatingAll,
		activatingSlug,
		removingSlug,
		resolveUrl,
		onConfigure,
		onUpdate,
		onActivate,
		onRemove,
	}: Props = $props();

	type SortKey = 'name' | 'author' | 'version' | 'enabled';
	let sortKey = $state<SortKey>('name');
	let sortDir = $state<'asc' | 'desc'>('asc');

	function toggleSort(key: SortKey) {
		if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		else { sortKey = key; sortDir = 'asc'; }
	}

	function compareValues(a: ThemeInfo, b: ThemeInfo, key: SortKey): number {
		switch (key) {
			case 'author':  return (a.author?.name ?? '').localeCompare(b.author?.name ?? '');
			case 'version': return (a.version ?? '').localeCompare(b.version ?? '', undefined, { numeric: true });
			case 'enabled': return (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0);
			default:        return a.name.localeCompare(b.name);
		}
	}

	const sorted = $derived.by(() => {
		const list = [...themes];
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
						{i18n.t('ADMIN_NEXT.ACTIVE')}
						{#if sortKey === 'enabled'}{#if sortDir === 'asc'}<ArrowUp size={11} />{:else}<ArrowDown size={11} />{/if}{/if}
					</button>
				</th>
				<th class="w-32 px-4 py-2 text-end font-medium">{i18n.t('ADMIN_NEXT.USERS_TABLE.ACTIONS')}</th>
			</tr>
		</thead>
		<tbody>
			{#each sorted as theme (theme.slug)}
				<tr class="border-b border-border transition-colors hover:bg-muted/30">
					<td class="px-4 py-2">
						<button class="inline-flex items-center gap-2 text-start text-primary hover:underline" onclick={() => onConfigure(theme.slug)}>
							<span class="flex h-8 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
								{#if resolveUrl(theme.thumbnail)}
									<img src={resolveUrl(theme.thumbnail)} alt={theme.name} class="h-full w-full object-cover" />
								{:else if theme.icon}
									<i class="{faIconClass(theme.icon)} text-xs text-muted-foreground"></i>
								{:else}
									<Palette size={14} class="text-muted-foreground" />
								{/if}
							</span>
							<span class="font-medium">{theme.name}</span>
							{#if isFirstParty(theme.author)}
								<BadgeCheck size={13} class="text-purple-500" />
							{/if}
							{#if theme.premium}
								<span class="rounded-full bg-red-500/15 px-1.5 py-0.5 text-[0.625rem] font-medium text-red-600 dark:text-red-400">{i18n.t('ADMIN_NEXT.PREMIUM')}</span>
							{/if}
							{#if theme.is_symlink}
								<CornerDownRight size={12} class="text-muted-foreground/60" />
							{/if}
						</button>
					</td>
					<td class="px-4 py-2 text-muted-foreground">{theme.author?.name ?? '—'}</td>
					<td class="px-4 py-2 font-mono text-xs">
						{theme.version}
						{#if theme.updatable}
							<span class="ms-1 inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[0.625rem] font-medium text-amber-600 dark:text-amber-400">
								<ArrowUpCircle size={10} />
								{theme.available_version}
							</span>
						{/if}
					</td>
					<td class="px-4 py-2">
						{#if theme.enabled}
							<span class="inline-flex items-center rounded-full bg-green-500/15 px-2.5 py-0.5 text-[0.625rem] font-medium text-green-600 dark:text-green-400">
								<Check size={10} class="me-0.5" /> {i18n.t('ADMIN_NEXT.ACTIVE')}
							</span>
						{:else if onActivate && canEdit}
							<button
								type="button"
								class="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-[0.625rem] font-medium text-muted-foreground transition-colors hover:bg-green-500/15 hover:text-green-600 disabled:opacity-50"
								onclick={(e) => onActivate(theme, e)}
								disabled={activatingSlug === theme.slug}
								title={i18n.t('ADMIN_NEXT.THEMES.ACTIVATE_THEME', { name: theme.name })}
							>
								{#if activatingSlug === theme.slug}
									<Loader2 size={10} class="me-0.5 animate-spin" />
								{/if}
								{i18n.t('ADMIN_NEXT.THEMES.ACTIVATE')}
							</button>
						{:else}
							<span class="text-xs text-muted-foreground">—</span>
						{/if}
					</td>
					<td class="px-4 py-2 text-end">
						<div class="inline-flex items-center gap-1">
							{#if theme.updatable && canEdit}
								<button
									class="rounded p-1 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
									aria-label={i18n.t('ADMIN_NEXT.UPDATE_TO_VERSION', { version: theme.available_version ?? '' })}
									title={i18n.t('ADMIN_NEXT.UPDATE_TO_VERSION', { version: theme.available_version ?? '' })}
									onclick={(e) => onUpdate(theme, e)}
									disabled={updatingSlug === theme.slug || updatingAll}
								>
									{#if updatingSlug === theme.slug}
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
								onclick={() => onConfigure(theme.slug)}
							>
								<Settings size={14} />
							</button>
							{#if onRemove && canEdit}
								<button
									class="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
									aria-label={i18n.t('ADMIN_NEXT.DELETE')}
									title={theme.enabled ? i18n.t('ADMIN_NEXT.THEMES.DELETE_ACTIVE_WARNING') : i18n.t('ADMIN_NEXT.DELETE')}
									onclick={(e) => onRemove(theme, e)}
									disabled={removingSlug === theme.slug}
								>
									{#if removingSlug === theme.slug}
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
						{i18n.t('ADMIN_NEXT.THEMES_TABLE.NO_THEMES')}
					</td>
				</tr>
			{/if}
		</tbody>
	</table>
</div>
