<script lang="ts">
	import { getContext } from 'svelte';
	import { Layers, ServerCog } from 'lucide-svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { CONFIG_SHADOWED_CTX, type ConfigShadowedCtx } from '$lib/utils/config-shadowed.svelte';

	/**
	 * One-line notice above a config form when a layer above the one being
	 * edited sets some of its values, so saving them here won't apply. The
	 * fields themselves carry the marker; this is the summary, with a way to
	 * switch to the environment that wins. Reads the `configShadowed` context.
	 */
	let { class: className = '' }: { class?: string } = $props();

	const ctx = getContext<ConfigShadowedCtx | undefined>(CONFIG_SHADOWED_CTX);

	const entries = $derived(ctx?.entries ?? []);
	const envs = $derived([
		...new Set(entries.filter((e) => e.source === 'environment' && e.environment).map((e) => e.environment as string)),
	]);
	const hasServer = $derived(entries.some((e) => e.source === 'server'));
	const message = $derived(
		envs.length === 0
			? i18n.t('ADMIN_NEXT.CONFIG.SHADOWED.BANNER_SERVER', { count: entries.length })
			: hasServer
				? i18n.t('ADMIN_NEXT.CONFIG.SHADOWED.BANNER_MIXED', { count: entries.length, env: envs.join(', ') })
				: i18n.t('ADMIN_NEXT.CONFIG.SHADOWED.BANNER_ENV', { count: entries.length, env: envs.join(', ') })
	);
</script>

{#if ctx && entries.length > 0}
	<div class="{className} flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm text-foreground" role="note">
		<span class="flex min-w-0 flex-1 items-center gap-2">
			{#if envs.length > 0}
				<Layers size={16} class="shrink-0 text-primary" />
			{:else}
				<ServerCog size={16} class="shrink-0 text-primary" />
			{/if}
			<span class="min-w-0">{message}</span>
		</span>
		{#each envs as env (env)}
			<button
				type="button"
				class="h-7 shrink-0 rounded-md border border-primary/40 bg-background px-2.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
				onclick={() => ctx.switchTo(env)}
			>
				{i18n.t('ADMIN_NEXT.CONFIG.SHADOWED.SWITCH_TO', { env })}
			</button>
		{/each}
	</div>
{/if}
