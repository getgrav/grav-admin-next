<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { getPermissionsBlueprint, type PermissionAction } from '$lib/api/endpoints/blueprints';
	import { Loader2, ChevronDown, Crown, Check, Ban, Minus } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';

	interface Props {
		value: Record<string, unknown>;
		onchange: (value: Record<string, unknown>) => void;
	}

	let { value, onchange }: Props = $props();

	let sections = $state<PermissionAction[]>([]);
	let loading = $state(true);
	let expandedSections = $state<Set<string>>(new Set());

	async function loadPermissions() {
		loading = true;
		try {
			sections = await getPermissionsBlueprint();
			for (const s of sections) {
				expandedSections.add(s.name);
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

	/** Unwrap the $state proxy once for reading. */
	function plainValue(): Record<string, unknown> {
		try {
			return JSON.parse(JSON.stringify(value));
		} catch {
			return {};
		}
	}

	function getPermValue(name: string): 'allowed' | 'denied' | 'unset' {
		const parts = name.split('.');
		let current: unknown = plainValue();
		for (const part of parts) {
			if (current && typeof current === 'object') {
				current = (current as Record<string, unknown>)[part];
			} else {
				return 'unset';
			}
		}
		if (current === true) return 'allowed';
		if (current === false) return 'denied';
		return 'unset';
	}

	/** Check if admin.super is explicitly allowed. */
	const isSuperAdmin = $derived.by(() => {
		return getPermValue('admin.super') === 'allowed';
	});

	/**
	 * Check if a permission is implicitly granted by admin.super.
	 * admin.super grants all admin.* and site.* permissions, but NOT api.* ones.
	 */
	function isImplicitlyGranted(name: string): boolean {
		if (!isSuperAdmin) return false;
		if (name === 'admin.super') return false; // Don't show crown on itself
		return name.startsWith('admin.') || name.startsWith('site.');
	}

	function setPermValue(name: string, newVal: 'allowed' | 'denied' | 'unset') {
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

{#snippet toggle(name: string)}
	{@const val = getPermValue(name)}
	{@const implicit = isImplicitlyGranted(name)}
	<div class="flex shrink-0 items-center gap-2">
		{#if implicit}
			<Crown size={14} class="text-purple-500" />
		{/if}
		<div class="flex shrink-0 overflow-hidden rounded-md border border-border text-[11px] font-medium">
			<button
				type="button"
				class="flex items-center justify-center px-2 py-1.5 transition-colors
					{val === 'allowed' ? 'bg-green-500 text-white' : 'text-muted-foreground hover:bg-muted'}"
				title={i18n.t('ADMIN_NEXT.ALLOWED')}
				aria-label={i18n.t('ADMIN_NEXT.ALLOWED')}
				onclick={() => setPermValue(name, val === 'allowed' ? 'unset' : 'allowed')}
			>
				<Check size={14} />
			</button>
			<button
				type="button"
				class="flex items-center justify-center border-x border-border px-2 py-1.5 transition-colors
					{val === 'denied' ? 'bg-red-400 text-white' : 'text-muted-foreground hover:bg-muted'}"
				title={i18n.t('ADMIN_NEXT.DENIED')}
				aria-label={i18n.t('ADMIN_NEXT.DENIED')}
				onclick={() => setPermValue(name, val === 'denied' ? 'unset' : 'denied')}
			>
				<Ban size={14} />
			</button>
			<button
				type="button"
				class="flex items-center justify-center px-2 py-1.5 transition-colors
					{val === 'unset' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted'}"
				title={i18n.t('ADMIN_NEXT.PERMISSIONS_FIELD.NOT_SET')}
				aria-label={i18n.t('ADMIN_NEXT.PERMISSIONS_FIELD.NOT_SET')}
				onclick={() => setPermValue(name, 'unset')}
			>
				<Minus size={14} />
			</button>
		</div>
	</div>
{/snippet}

{#snippet permRow(action: PermissionAction, depth: number)}
	<div class="flex items-center justify-between border-t border-border px-4 py-2" style="padding-left: {16 + depth * 24}px">
		<span class="text-sm {depth > 0 ? 'text-muted-foreground' : 'text-foreground'}">{action.label}</span>
		{@render toggle(action.name)}
	</div>
	{#if action.children}
		{#each action.children as child}
			{@render permRow(child, depth + 1)}
		{/each}
	{/if}
{/snippet}

{#if loading}
	<div class="flex items-center justify-center py-8">
		<Loader2 size={20} class="animate-spin text-muted-foreground" />
	</div>
{:else}
	<div class="space-y-3">
		{#each sections as section}
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
					<span class="text-sm font-semibold text-foreground">{section.label}</span>
				</div>

				{#if expandedSections.has(section.name) && section.children}
					{#each section.children as action}
						{@render permRow(action, 0)}
					{/each}
				{/if}
			</div>
		{/each}
	</div>
{/if}
