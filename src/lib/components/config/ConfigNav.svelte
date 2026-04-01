<script lang="ts">
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { Cpu, Globe, Image, Shield, Info } from 'lucide-svelte';

	interface Props {
		sections: string[];
	}

	let { sections }: Props = $props();

	const translateLabel = i18n.tMaybe;

	const icons: Record<string, typeof Cpu> = {
		system: Cpu,
		site: Globe,
		media: Image,
		security: Shield,
		info: Info
	};

	function sectionLabel(scope: string): string {
		// Try admin translation key first, fall back to capitalized name
		const key = `PLUGIN_ADMIN.${scope.toUpperCase()}`;
		const translated = translateLabel(key);
		return translated !== key ? translated : scope.charAt(0).toUpperCase() + scope.slice(1);
	}

	function isActive(scope: string): boolean {
		return page.url.pathname === `${base}/config/${scope}`;
	}
</script>

<div class="flex gap-1 border-b border-border">
	{#each sections as scope (scope)}
		{@const Icon = icons[scope]}
		<a
			href="{base}/config/{scope}"
			class="flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors
				{isActive(scope)
					? 'border-primary text-primary'
					: 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'}"
		>
			{#if Icon}
				<Icon size={14} strokeWidth={isActive(scope) ? 2 : 1.5} />
			{/if}
			{sectionLabel(scope)}
		</a>
	{/each}
</div>
