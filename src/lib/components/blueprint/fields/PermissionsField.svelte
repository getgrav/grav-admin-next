<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { i18n } from '$lib/stores/i18n.svelte';

	interface Props {
		field: BlueprintField;
		value: unknown;
		onchange: (value: unknown) => void;
	}

	let { field, value, onchange }: Props = $props();
	const translateLabel = i18n.tMaybe;

	/**
	 * Permissions are stored as a flat object:
	 *   { "admin.login": true, "admin.pages": true, "admin.configuration": false }
	 *
	 * The permissions tree structure will come from an API endpoint (future).
	 * For now, we render the flat access object as an editable list with
	 * three-state toggles: Allowed (true), Denied (false), Not Set (removed).
	 */

	interface PermEntry {
		key: string;
		state: 'allowed' | 'denied' | 'unset';
	}

	const entries = $derived.by((): PermEntry[] => {
		if (!value || typeof value !== 'object') return [];
		const obj = value as Record<string, unknown>;
		return Object.entries(obj).map(([key, val]) => ({
			key,
			state: val === true ? 'allowed' : val === false ? 'denied' : 'unset',
		}));
	});

	function updateEntry(key: string, state: 'allowed' | 'denied' | 'unset') {
		const obj = { ...(value as Record<string, unknown> ?? {}) };
		if (state === 'unset') {
			delete obj[key];
		} else {
			obj[key] = state === 'allowed';
		}
		onchange(obj);
	}

	function getStateClass(state: string, target: string): string {
		if (state === target) {
			switch (target) {
				case 'allowed': return 'bg-green-500 text-white';
				case 'denied': return 'bg-red-500 text-white';
				case 'unset': return 'bg-muted text-foreground';
			}
		}
		return 'text-muted-foreground hover:bg-accent';
	}
</script>

<div class="space-y-2">
	{#if field.label || field.help}
		<div>
			{#if field.label}
				<label class="text-sm font-semibold text-foreground">{translateLabel(field.label)}</label>
			{/if}
			{#if field.help}
				<p class="mt-0.5 text-xs text-muted-foreground">{translateLabel(field.help)}</p>
			{/if}
		</div>
	{/if}

	{#if entries.length === 0}
		<div class="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
			No permissions configured
		</div>
	{:else}
		<div class="space-y-1">
			{#each entries as entry (entry.key)}
				<div class="flex items-center gap-3 rounded-md border border-border bg-muted/20 px-3 py-2">
					<span class="flex-1 font-mono text-xs text-foreground">{entry.key}</span>
					<div class="flex overflow-hidden rounded-md border border-border text-xs">
						<button
							type="button"
							class="px-2.5 py-1 transition-colors {getStateClass(entry.state, 'allowed')}"
							onclick={() => updateEntry(entry.key, 'allowed')}
						>
							Allowed
						</button>
						<button
							type="button"
							class="border-x border-border px-2.5 py-1 transition-colors {getStateClass(entry.state, 'denied')}"
							onclick={() => updateEntry(entry.key, 'denied')}
						>
							Denied
						</button>
						<button
							type="button"
							class="px-2.5 py-1 transition-colors {getStateClass(entry.state, 'unset')}"
							onclick={() => updateEntry(entry.key, entry.state === 'unset' ? 'unset' : 'unset')}
						>
							Not Set
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
