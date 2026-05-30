<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { getPermissionsBlueprint, type PermissionAction } from '$lib/api/endpoints/blueprints';
	import { Loader2, ChevronDown } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import PermissionRow from './PermissionRow.svelte';

	interface Props {
		value: Record<string, unknown>;
		onchange: (value: Record<string, unknown>) => void;
	}

	let { value, onchange }: Props = $props();

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

	/** Whether admin.super is explicitly allowed — implies all admin/site perms. */
	const superAdmin = $derived(getPathValue(value, 'admin.super') === true);
	/** Whether api.super is explicitly allowed — implies all api perms. */
	const apiSuper = $derived(getPathValue(value, 'api.super') === true);

	function handleToggle(name: string, newVal: 'allowed' | 'denied' | 'unset') {
		const parts = name.split('.');
		const updated = deepClone(value);
		let current: Record<string, unknown> = updated;

		for (let i = 0; i < parts.length - 1; i++) {
			const key = parts[i];
			if (typeof current[key] !== 'object' || current[key] === null) {
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

		onchange(updated);
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
							onToggle={handleToggle}
						/>
					{/each}
				{/if}
			</div>
		{/each}
	</div>
{/if}
