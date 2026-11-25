<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { getPermissionsBlueprint, type PermissionAction } from '$lib/api/endpoints/blueprints';
	import type { InheritedAccessMap } from '$lib/utils/user-access';
	import {
		effectiveRule,
		flattenAccessRules,
		serializeAccessRules,
		setAccessRule,
	} from '$lib/utils/access-rules';
	import { Loader2, ChevronDown, Check, Users, Crown, Lock } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import PermissionRow from './PermissionRow.svelte';

	interface Props {
		value: Record<string, unknown>;
		/** Read-only group-inherited permissions overlaid on the toggles. */
		inherited?: InheritedAccessMap;
		/** The access the account already has saved. A permission it already
		 *  holds stays allowed even when the signed-in user can't grant it. */
		granted?: Record<string, unknown>;
		onchange: (value: Record<string, unknown>) => void;
	}

	let { value, inherited, granted, onchange }: Props = $props();

	let sections = $state<PermissionAction[]>([]);
	let loading = $state(true);
	let expandedSections = $state<Set<string>>(new Set());

	// admin2 authority is the `api.*` tree; the `admin.*` permissions are
	// admin-classic (legacy). Order the core groups site → api → admin, keep
	// plugin sections between api and the legacy admin block at the bottom.
	function sectionRank(name: string): number {
		if (name === 'site') return 0;
		if (name === 'api') return 1;
		if (name === 'admin') return 3;
		return 2;
	}

	async function loadPermissions() {
		loading = true;
		try {
			const loaded = await getPermissionsBlueprint();
			// Stable sort keeps the original order within each rank group.
			sections = [...loaded].sort((a, b) => sectionRank(a.name) - sectionRank(b.name));
			for (const s of sections) {
				// Collapse the deprecated admin-classic section by default.
				if (s.name !== 'admin') {
					expandedSections.add(s.name);
				}
			}
			expandedSections = new Set(expandedSections);
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.PERMISSIONS_FIELD.FAILED_TO_LOAD_PERMISSIONS'));
		} finally {
			loading = false;
		}
	}

	// Read every access map once into flat rules keyed by dotted name, so a rule
	// that comes back as a top-level dotted key (`'api.system.backup': false`
	// next to `api: { system: true }`) lands on the same row as a nested one.
	const rules = $derived(flattenAccessRules(value));
	const grantedRules = $derived(flattenAccessRules(granted));

	/** Find a permission action by its full dotted name in the loaded tree. */
	function findAction(name: string, nodes: PermissionAction[] = sections): PermissionAction | null {
		for (const node of nodes) {
			if (node.name === name) return node;
			if (node.children) {
				const found = findAction(name, node.children);
				if (found) return found;
			}
		}
		return null;
	}

	/** Full names of a node's immediate children (e.g. `api.pages.read`). */
	function childNames(dottedName: string): string[] {
		return (findAction(dottedName)?.children ?? []).map((c) => c.name);
	}

	/** Whether the saved account grants `name`, directly or through a parent's
	 *  blanket `true` (mirrors the API's check for grants that aren't new). */
	function alreadyGranted(name: string): boolean {
		return effectiveRule(grantedRules, name) === true;
	}

	/** Whether the Allow toggle may be switched on for `name`. The API refuses a
	 *  grant the signed-in user doesn't hold themselves, unless it isn't new. */
	function canAllow(name: string): boolean {
		return findAction(name)?.grantable !== false || alreadyGranted(name);
	}

	/** Whether any permission is out of reach — shows the explanatory note. */
	function anyLocked(nodes: PermissionAction[]): boolean {
		return nodes.some((n) => n.grantable === false || anyLocked(n.children ?? []));
	}
	const hasLocked = $derived(anyLocked(sections));

	/** Whether any group-inherited permissions are present — gates the legend. */
	const hasInherited = $derived(!!inherited && Object.keys(inherited).length > 0);

	/** Whether admin.super is explicitly allowed — implies all admin/site perms. */
	const superAdmin = $derived(rules['admin.super'] === true);
	/** Whether api.super is explicitly allowed — implies all api perms. */
	const apiSuper = $derived(rules['api.super'] === true);

	function handleToggle(name: string, newVal: 'allowed' | 'denied' | 'unset') {
		// Writing back from the flat rules also drops the empty branches a cleared
		// rule leaves, so a set-then-unset round-trips to the original map, and
		// an empty map that arrives from the API as `[]` reads as `{}` (admin2#58).
		onchange(serializeAccessRules(setAccessRule(rules, name, newVal, childNames)));
	}

	function toggleSection(name: string) {
		if (expandedSections.has(name)) {
			expandedSections.delete(name);
		} else {
			expandedSections.add(name);
		}
		expandedSections = new Set(expandedSections);
	}

	$effect(() => {
		loadPermissions();
	});
</script>

{#if loading}
	<div class="flex items-center justify-center py-8">
		<Loader2 size={20} class="animate-spin text-muted-foreground" />
	</div>
{:else}
	{#if hasInherited}
		<div class="mb-3 rounded-lg border border-border bg-muted/20 px-4 py-3">
			<p class="text-xs text-muted-foreground">
				{i18n.t('ADMIN_NEXT.PERMISSIONS_FIELD.LEGEND_INTRO')}
			</p>
			<div class="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
				<span class="inline-flex items-center gap-1.5">
					<span class="inline-flex h-5 w-5 items-center justify-center rounded bg-green-500 text-white">
						<Check size={12} />
					</span>
					{i18n.t('ADMIN_NEXT.PERMISSIONS_FIELD.LEGEND_DIRECT')}
				</span>
				<span class="inline-flex items-center gap-1.5">
					<span class="inline-flex h-5 w-5 items-center justify-center rounded bg-green-500/15 text-green-600 ring-1 ring-inset ring-green-500/30 dark:text-green-400">
						<Check size={12} />
					</span>
					{i18n.t('ADMIN_NEXT.PERMISSIONS_FIELD.LEGEND_INHERITED')}
				</span>
				<span class="inline-flex items-center gap-1.5">
					<Users size={14} class="text-amber-500" />
					{i18n.t('ADMIN_NEXT.PERMISSIONS_FIELD.LEGEND_OVERRIDE')}
				</span>
				<span class="inline-flex items-center gap-1.5">
					<Crown size={14} class="text-purple-500" />
					{i18n.t('ADMIN_NEXT.PERMISSIONS_FIELD.LEGEND_SUPER')}
				</span>
			</div>
		</div>
	{/if}
	{#if hasLocked}
		<p class="mb-3 flex items-start gap-2 text-xs text-muted-foreground">
			<Lock size={13} class="mt-px shrink-0" />
			<span>{i18n.t('ADMIN_NEXT.PERMISSIONS_FIELD.LOCKED_NOTE')}</span>
		</p>
	{/if}
	<div class="space-y-3">
		{#each sections as section (section.name)}
			<div class="overflow-hidden rounded-lg border border-border">
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<div
					class="flex cursor-pointer items-center gap-2 bg-muted/30 px-4 py-2.5"
					onclick={() => toggleSection(section.name)}
				>
					<ChevronDown
						size={14}
						class="shrink-0 text-muted-foreground transition-transform {expandedSections.has(section.name) ? '' : '-rotate-90'}"
					/>
					<span class="text-sm font-semibold text-foreground">
						{section.name === 'admin'
							? i18n.t('ADMIN_NEXT.PERMISSIONS_FIELD.ADMIN_LEGACY')
							: section.label}
					</span>
				</div>

				{#if expandedSections.has(section.name) && section.children}
					{#each section.children as action (action.name)}
						<PermissionRow
							{action}
							depth={0}
							{rules}
							{superAdmin}
							{apiSuper}
							{inherited}
							{canAllow}
							onToggle={handleToggle}
						/>
					{/each}
				{/if}
			</div>
		{/each}
	</div>
{/if}
