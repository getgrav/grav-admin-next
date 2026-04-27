<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { api } from '$lib/api/client';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { ChevronsUpDown } from 'lucide-svelte';

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
	<div class="relative">
		<select
			class="flex h-10 w-full appearance-none rounded-lg border border-input bg-muted/50 pl-3 pr-8 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
			value={value ?? field.default ?? ''}
			onchange={(e) => onchange((e.target as HTMLSelectElement).value)}
			disabled={field.disabled || loading}
		>
			{#if loading}
				<option value="">{i18n.t('ADMIN_NEXT.FIELDS.THEME_SELECT.LOADING_THEMES')}</option>
			{:else}
				<option value="">{i18n.t('ADMIN_NEXT.FIELDS.THEME_SELECT.SELECT_THEME')}</option>
				{#each themes as theme (theme.slug)}
					<option value={theme.slug} selected={String(value) === theme.slug}>{theme.name}</option>
				{/each}
			{/if}
		</select>
		<div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5">
			<ChevronsUpDown size={14} class="text-muted-foreground" />
		</div>
	</div>
</div>
