<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { api } from '$lib/api/client';
	import { i18n } from '$lib/stores/i18n.svelte';

	interface Props {
		field: BlueprintField;
		value: unknown;
		onchange: (value: unknown) => void;
	}

	let { field, value, onchange }: Props = $props();
	const translateLabel = i18n.tMaybe;

	interface ThemeInfo {
		slug: string;
		name: string;
	}

	let themes = $state<ThemeInfo[]>([]);
	let loading = $state(true);

	async function loadThemes() {
		loading = true;
		try {
			themes = await api.get<ThemeInfo[]>('/gpm/themes');
		} catch {
			themes = [];
		} finally {
			loading = false;
		}
	}

	$effect(() => { loadThemes(); });
</script>

<div class="space-y-2">
	{#if field.label || field.help}
		<div>
			{#if field.label}
				<label class="text-sm font-semibold text-foreground">
					{translateLabel(field.label)}
				</label>
			{/if}
			{#if field.help}
				<p class="mt-0.5 text-xs text-muted-foreground">{translateLabel(field.help)}</p>
			{/if}
		</div>
	{/if}
	<select
		class="flex h-10 w-full rounded-lg border border-input bg-muted/50 px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
		value={value ?? field.default ?? ''}
		onchange={(e) => onchange((e.target as HTMLSelectElement).value)}
		disabled={field.disabled || loading}
	>
		{#if loading}
			<option value="">Loading themes...</option>
		{:else}
			<option value="">— Select theme —</option>
			{#each themes as theme (theme.slug)}
				<option value={theme.slug} selected={String(value) === theme.slug}>{theme.name}</option>
			{/each}
		{/if}
	</select>
</div>
