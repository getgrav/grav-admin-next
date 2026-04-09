<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api/client';
	import { contextPanelStore } from '$lib/stores/contextPanels.svelte';
	import { invalidations } from '$lib/stores/invalidation.svelte';
	import * as icons from 'lucide-svelte';

	interface Props {
		context: string;
		route: string;
		lang: string;
	}

	let { context, route, lang }: Props = $props();

	function resolveIcon(name: string): typeof icons.History | undefined {
		// Convert kebab-case to PascalCase: "clock-arrow-up" -> "ClockArrowUp"
		const pascal = name.replace(/(^|-)([a-z])/g, (_: string, __: string, c: string) => c.toUpperCase());
		return (icons as Record<string, any>)[pascal];
	}

	// Fetch badge counts for panels with badgeEndpoints
	async function fetchBadges() {
		const panels = contextPanelStore.forContext(context);
		for (const panel of panels) {
			if (!panel.badgeEndpoint) continue;
			try {
				const separator = panel.badgeEndpoint.includes('?') ? '&' : '?';
				const url = `${panel.badgeEndpoint}${separator}route=${encodeURIComponent(route)}&lang=${encodeURIComponent(lang)}&type=${encodeURIComponent(context)}`;
				const result = await api.get<{ count: number }>(url);
				contextPanelStore.setBadge(panel.id, result.count);
			} catch {
				// Badge fetch failure is non-critical
			}
		}
	}

	// Fetch badges on mount and when route/lang change
	$effect(() => {
		if (contextPanelStore.loaded && route && context) {
			// Track lang to re-fetch when language changes
			void lang;
			fetchBadges();
		}
	});

	// Re-fetch badges on save events (pages, config, plugins, themes)
	onMount(() => {
		const unsubs = [
			invalidations.subscribe('pages:update', () => fetchBadges()),
			invalidations.subscribe('config:update', () => fetchBadges()),
			invalidations.subscribe('plugins:update', () => fetchBadges()),
			invalidations.subscribe('themes:update', () => fetchBadges()),
		];

		// Listen for revisions-changed events from web components
		const handleChanged = () => fetchBadges();
		window.addEventListener('grav:revisions:changed', handleChanged);

		return () => {
			unsubs.forEach(u => u());
			window.removeEventListener('grav:revisions:changed', handleChanged);
		};
	});
</script>

{#if contextPanelStore.loaded}
	{#each contextPanelStore.forContext(context) as panel (panel.id)}
		{@const Icon = resolveIcon(panel.icon)}
		{@const badge = contextPanelStore.badges[panel.id]}
		{@const isActive = contextPanelStore.activePanel === panel.id}

		<button
			class="relative inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors
				{isActive
					? 'border-primary bg-primary/10 text-primary'
					: 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'}"
			onclick={() => contextPanelStore.toggle(panel.id, { route, lang, type: context })}
			title={panel.label}
		>
			{#if Icon}
				<Icon size={14} />
			{/if}
			{#if badge && badge > 0}
				<span class="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
					{badge > 99 ? '99+' : badge}
				</span>
			{/if}
		</button>
	{/each}
{/if}
