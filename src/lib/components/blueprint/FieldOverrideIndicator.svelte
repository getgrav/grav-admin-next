<script lang="ts" module>
	export interface ConfigOverridesCtx {
		/** Is this dotted field path overridden in the active layer's file? */
		isOverridden: (path: string) => boolean;
		/** The value this path reverts to (the layer beneath). */
		getFallback: (path: string) => unknown;
		/** Revert this path, letting the value beneath take over. */
		revert: (path: string) => void;
		/** Whether the user may write (revert) config. */
		readonly canRevert: boolean;
	}
</script>

<script lang="ts">
	import { getContext } from 'svelte';
	import { RotateCcw } from 'lucide-svelte';
	import { i18n } from '$lib/stores/i18n.svelte';

	let { path }: { path: string } = $props();

	// Only the config page provides this; elsewhere (plugin pages, page editor)
	// the context is absent and the indicator renders nothing.
	const ctx = getContext<ConfigOverridesCtx | undefined>('configOverrides');
	const overridden = $derived(!!ctx?.isOverridden(path));

	function fallbackLabel(): string {
		const v = ctx?.getFallback(path);
		if (v === null || v === undefined || v === '') {
			return i18n.t('ADMIN_NEXT.CONFIG.OVERRIDE.DEFAULT_EMPTY');
		}
		if (typeof v === 'object') return JSON.stringify(v);
		return String(v);
	}
</script>

{#if ctx && overridden}
	<button
		type="button"
		class="inline-flex shrink-0 items-center justify-center rounded p-0.5 text-amber-500/80 transition-colors hover:bg-muted hover:text-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
		title={i18n.t('ADMIN_NEXT.CONFIG.OVERRIDE.REVERT_TOOLTIP', { value: fallbackLabel() })}
		aria-label={i18n.t('ADMIN_NEXT.CONFIG.OVERRIDE.REVERT_TOOLTIP', { value: fallbackLabel() })}
		disabled={!ctx.canRevert}
		onclick={(e) => {
			e.preventDefault();
			e.stopPropagation();
			ctx.revert(path);
		}}
	>
		<RotateCcw size={12} strokeWidth={2.25} />
	</button>
{/if}
