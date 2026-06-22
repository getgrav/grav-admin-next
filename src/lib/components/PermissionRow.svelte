<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import type { PermissionAction } from '$lib/api/endpoints/blueprints';
	import type { InheritedAccessMap } from '$lib/utils/user-access';
	import { Crown, Check, Ban, Minus, Users } from 'lucide-svelte';
	import Self from './PermissionRow.svelte';

	interface Props {
		action: PermissionAction;
		depth: number;
		/** The full access tree, passed so the row's $derived val tracks
		 *  reactivity across component boundaries. */
		value: Record<string, unknown>;
		/** Whether admin.super is explicitly allowed in `value` — passed so
		 *  every row reads the same canonical signal. */
		superAdmin: boolean;
		/** Whether api.super is explicitly allowed — implies every api.* row. */
		apiSuper: boolean;
		/** Read-only overlay of permissions the user inherits from groups. The
		 *  row ghosts the matching toggle and badges its source; it never alters
		 *  `value`. Setting a toggle promotes it to a direct permission as usual. */
		inherited?: InheritedAccessMap;
		/** Toggle setter — bubbles back up to the parent field. */
		onToggle: (name: string, newVal: 'allowed' | 'denied' | 'unset') => void;
	}

	let { action, depth, value, superAdmin, apiSuper, inherited, onToggle }: Props = $props();

	const val = $derived.by((): 'allowed' | 'denied' | 'unset' => {
		const parts = action.name.split('.');
		let current: unknown = value;
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
	});

	// A super flag implies every permission in its own scope, so we badge those
	// rows with a crown: admin.super covers admin.*/site.*, api.super covers
	// api.*. The super toggle itself is never crowned.
	const implicit = $derived(
		(superAdmin
			&& action.name !== 'admin.super'
			&& (action.name.startsWith('admin.') || action.name.startsWith('site.')))
		|| (apiSuper
			&& action.name !== 'api.super'
			&& action.name.startsWith('api.'))
	);

	// Group-inherited result for this exact permission (read-only overlay).
	const inheritedHere = $derived(inherited?.[action.name]);
	// When there's no direct value, the toggle ghosts to preview the group
	// result. A direct value that *disagrees* with the group is a real override
	// (amber); a direct value that agrees is just a redundant grant, not flagged.
	const ghostAllow = $derived(val === 'unset' && inheritedHere?.state === 'allowed');
	const ghostDeny = $derived(val === 'unset' && inheritedHere?.state === 'denied');
	const isOverride = $derived(
		(val === 'allowed' && inheritedHere?.state === 'denied') ||
		(val === 'denied' && inheritedHere?.state === 'allowed'),
	);

	const inheritedTooltip = $derived.by((): string => {
		if (!inheritedHere) return '';
		const groups = inheritedHere.groups.join(', ');
		if (isOverride) {
			return i18n.t('ADMIN_NEXT.PERMISSIONS_FIELD.OVERRIDES_GROUP', { groups });
		}
		return inheritedHere.state === 'allowed'
			? i18n.t('ADMIN_NEXT.PERMISSIONS_FIELD.INHERITED_ALLOWED', { groups })
			: i18n.t('ADMIN_NEXT.PERMISSIONS_FIELD.INHERITED_DENIED', { groups });
	});
</script>

<div
	class="flex items-center justify-between border-t border-border px-4 py-2"
	style="padding-left: {16 + depth * 24}px"
>
	<span class="text-sm {depth > 0 ? 'text-muted-foreground' : 'text-foreground'}">
		{action.label}
	</span>
	<div class="flex shrink-0 items-center gap-2">
		{#if implicit}
			<Crown size={14} class="text-purple-500" />
		{/if}
		{#if inheritedHere}
			<span title={inheritedTooltip} aria-label={inheritedTooltip} class="inline-flex">
				<Users size={14} class={isOverride ? 'text-amber-500' : 'text-muted-foreground/70'} />
			</span>
		{/if}
		<div class="flex shrink-0 overflow-hidden rounded-md border border-border text-[0.6875rem] font-medium">
			<button
				type="button"
				class="flex items-center justify-center px-2 py-1.5 transition-colors
					{val === 'allowed'
						? 'bg-green-500 text-white'
						: ghostAllow
							? 'bg-green-500/15 text-green-600 ring-1 ring-inset ring-green-500/30 dark:text-green-400'
							: 'text-muted-foreground hover:bg-muted'}"
				title={ghostAllow ? inheritedTooltip : i18n.t('ADMIN_NEXT.ALLOWED')}
				aria-label={i18n.t('ADMIN_NEXT.ALLOWED')}
				onclick={() => onToggle(action.name, val === 'allowed' ? 'unset' : 'allowed')}
			>
				<Check size={14} />
			</button>
			<button
				type="button"
				class="flex items-center justify-center border-x border-border px-2 py-1.5 transition-colors
					{val === 'denied'
						? 'bg-red-400 text-white'
						: ghostDeny
							? 'bg-red-400/15 text-red-500 ring-1 ring-inset ring-red-400/30 dark:text-red-400'
							: 'text-muted-foreground hover:bg-muted'}"
				title={ghostDeny ? inheritedTooltip : i18n.t('ADMIN_NEXT.DENIED')}
				aria-label={i18n.t('ADMIN_NEXT.DENIED')}
				onclick={() => onToggle(action.name, val === 'denied' ? 'unset' : 'denied')}
			>
				<Ban size={14} />
			</button>
			<button
				type="button"
				class="flex items-center justify-center px-2 py-1.5 transition-colors
					{val === 'unset' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted'}"
				title={i18n.t('ADMIN_NEXT.PERMISSIONS_FIELD.NOT_SET')}
				aria-label={i18n.t('ADMIN_NEXT.PERMISSIONS_FIELD.NOT_SET')}
				onclick={() => onToggle(action.name, 'unset')}
			>
				<Minus size={14} />
			</button>
		</div>
	</div>
</div>

{#if action.children}
	{#each action.children as child (child.name)}
		<Self
			action={child}
			depth={depth + 1}
			{value}
			{superAdmin}
			{apiSuper}
			{inherited}
			{onToggle}
		/>
	{/each}
{/if}
