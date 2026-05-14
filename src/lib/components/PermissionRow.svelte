<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import type { PermissionAction } from '$lib/api/endpoints/blueprints';
	import { Crown, Check, Ban, Minus } from 'lucide-svelte';
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
		/** Toggle setter — bubbles back up to the parent field. */
		onToggle: (name: string, newVal: 'allowed' | 'denied' | 'unset') => void;
	}

	let { action, depth, value, superAdmin, onToggle }: Props = $props();

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

	const implicit = $derived(
		superAdmin
		&& action.name !== 'admin.super'
		&& (action.name.startsWith('admin.') || action.name.startsWith('site.'))
	);
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
		<div class="flex shrink-0 overflow-hidden rounded-md border border-border text-[0.6875rem] font-medium">
			<button
				type="button"
				class="flex items-center justify-center px-2 py-1.5 transition-colors
					{val === 'allowed' ? 'bg-green-500 text-white' : 'text-muted-foreground hover:bg-muted'}"
				title={i18n.t('ADMIN_NEXT.ALLOWED')}
				aria-label={i18n.t('ADMIN_NEXT.ALLOWED')}
				onclick={() => onToggle(action.name, val === 'allowed' ? 'unset' : 'allowed')}
			>
				<Check size={14} />
			</button>
			<button
				type="button"
				class="flex items-center justify-center border-x border-border px-2 py-1.5 transition-colors
					{val === 'denied' ? 'bg-red-400 text-white' : 'text-muted-foreground hover:bg-muted'}"
				title={i18n.t('ADMIN_NEXT.DENIED')}
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
			{onToggle}
		/>
	{/each}
{/if}
