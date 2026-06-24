<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { getPermissionsBlueprint, type PermissionAction } from '$lib/api/endpoints/blueprints';
	import { pruneEmpty } from '$lib/utils/blueprint-validation';
	import { toAccessRecord, type InheritedAccessMap } from '$lib/utils/user-access';
	import { Loader2, ChevronDown, Check, Users, Crown } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import PermissionRow from './PermissionRow.svelte';

	interface Props {
		value: Record<string, unknown>;
		/** Read-only group-inherited permissions overlaid on the toggles. */
		inherited?: InheritedAccessMap;
		onchange: (value: Record<string, unknown>) => void;
	}

	let { value, inherited, onchange }: Props = $props();

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

	function deepClone(obj: Record<string, unknown>): Record<string, unknown> {
		return JSON.parse(JSON.stringify(obj));
	}

	function getPathValue(tree: Record<string, unknown>, name: string): unknown {
		const parts = name.split('.');
		let current: unknown = tree;
		for (const part of parts) {
			if (current && typeof current === 'object') {
				current = (current as Record<string, unknown>)[part];
			} else {
				return undefined;
			}
		}
		return current;
	}

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

	/** Leaf segments of a node's immediate children (e.g. ['read','write']). */
	function childLeafKeys(dottedName: string): string[] {
		return (findAction(dottedName)?.children ?? []).map((c) => c.name.split('.').pop() as string);
	}

	/** Whether any group-inherited permissions are present — gates the legend. */
	const hasInherited = $derived(!!inherited && Object.keys(inherited).length > 0);

	/** Whether admin.super is explicitly allowed — implies all admin/site perms. */
	const superAdmin = $derived(getPathValue(value, 'admin.super') === true);
	/** Whether api.super is explicitly allowed — implies all api perms. */
	const apiSuper = $derived(getPathValue(value, 'api.super') === true);

	function handleToggle(name: string, newVal: 'allowed' | 'denied' | 'unset') {
		const parts = name.split('.');
		// Coerce to a plain object first: an empty access map arrives from the API
		// as `[]`, and mutating that as an object then pruning would lose the
		// changes, so the first permission could never be added (admin2#58).
		const updated = deepClone(toAccessRecord(value));
		let current: Record<string, unknown> = updated;

		for (let i = 0; i < parts.length - 1; i++) {
			const key = parts[i];
			const ancestor = current[key];
			if (typeof ancestor === 'boolean') {
				// The ancestor holds a blanket grant (e.g. `api.pages: true`). Grav's
				// nested access can't keep a parent boolean and a child override at
				// once, so descending here would silently drop the blanket. Preserve
				// the intent by materialising it onto the node's known children before
				// we set the more specific permission (admin2#50).
				const expanded: Record<string, unknown> = {};
				for (const child of childLeafKeys(parts.slice(0, i + 1).join('.'))) {
					expanded[child] = ancestor;
				}
				current[key] = expanded;
			} else if (typeof ancestor !== 'object' || ancestor === null) {
				current[key] = {};
			}
			current = current[key] as Record<string, unknown>;
		}

		const lastKey = parts[parts.length - 1];
		if (newVal === 'allowed') {
			current[lastKey] = true;
		} else if (newVal === 'denied') {
			current[lastKey] = false;
		} else {
			delete current[lastKey];
		}

		// Unsetting a permission deletes the leaf but leaves the parent objects
		// the walk created above (e.g. `api.pages: {}`). Prune those empty
		// branches so the tree round-trips back to its original shape — otherwise
		// a set-then-unset leaves `{api:{pages:{}}}` and the form looks dirty with
		// no net change, and the empty objects get persisted (admin2#50).
		onchange(pruneEmpty(updated) as Record<string, unknown>);
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
							{value}
							{superAdmin}
							{apiSuper}
							{inherited}
							onToggle={handleToggle}
						/>
					{/each}
				{/if}
			</div>
		{/each}
	</div>
{/if}
