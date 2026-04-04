<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { auth } from '$lib/stores/auth.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { onMount } from 'svelte';

	interface Props {
		field: BlueprintField;
		value: unknown;
		onchange: (value: unknown) => void;
		oncommit?: (value: unknown) => void;
		/** Plugin slug that provides this custom field */
		pluginSlug: string;
		/** Field type name (used to resolve the script URL and element tag) */
		fieldType: string;
	}

	let { field, value, onchange, oncommit, pluginSlug, fieldType }: Props = $props();
	const translateLabel = i18n.tMaybe;

	let containerEl = $state<HTMLDivElement | null>(null);
	let loaded = $state(false);
	let error = $state('');

	// Web component tag name: plugin-slug--field-type (must contain a hyphen)
	const tagName = `grav-${pluginSlug}--${fieldType}`;

	// Global loading lock — prevents multiple instances from loading the same script
	const loadingPromises: Record<string, Promise<void> | undefined> = ((window as any).__GRAV_FIELD_LOADING ??= {});

	function getScriptUrl(): string {
		return `${auth.serverUrl}${auth.apiPrefix}/gpm/plugins/${pluginSlug}/field/${fieldType}`;
	}

	function getAuthHeaders(): Record<string, string> {
		const h: Record<string, string> = {};
		if (auth.accessToken) h['Authorization'] = `Bearer ${auth.accessToken}`;
		if (auth.environment) h['X-Grav-Environment'] = auth.environment;
		return h;
	}

	async function loadComponent() {
		// If the custom element is already defined, just mount
		if (customElements.get(tagName)) {
			loaded = true;
			mountElement();
			return;
		}

		// If another instance is already loading this tag, wait for it
		if (loadingPromises[tagName]) {
			try {
				await loadingPromises[tagName];
				loaded = true;
				mountElement();
			} catch (err) {
				error = `Failed to load custom field "${fieldType}"`;
			}
			return;
		}

		// First instance — load the script
		loadingPromises[tagName] = (async () => {
			const headers = getAuthHeaders();
			const response = await fetch(getScriptUrl(), { headers });
			if (!response.ok) {
				throw new Error(`Failed to load custom field: ${response.statusText}`);
			}

			const code = await response.text();

			// Expose auth context as globals for web component API calls
			window.__GRAV_API_SERVER_URL = auth.serverUrl;
			window.__GRAV_API_PREFIX = auth.apiPrefix || '/api/v1';
			window.__GRAV_API_TOKEN = auth.accessToken;

			// Execute the module — it calls customElements.define(TAG, ...)
			const blob = new Blob([
				`window.__GRAV_FIELD_TAG = ${JSON.stringify(tagName)};\n${code}`
			], { type: 'application/javascript' });
			const blobUrl = URL.createObjectURL(blob);
			await import(/* @vite-ignore */ blobUrl);
			URL.revokeObjectURL(blobUrl);
			await customElements.whenDefined(tagName);
		})();

		try {
			await loadingPromises[tagName];
			loaded = true;
			mountElement();
		} catch (err) {
			console.error(`[CustomField] Failed to load ${pluginSlug}/${fieldType}:`, err);
			error = `Failed to load custom field "${fieldType}"`;
		}
	}

	function mountElement() {
		if (!containerEl) return;

		// Clear any previous element
		containerEl.innerHTML = '';

		const el = document.createElement(tagName) as HTMLElement & {
			field?: BlueprintField;
			value?: unknown;
		};

		// Set properties
		el.field = field;
		el.value = value;

		// Listen for value changes from the web component
		el.addEventListener('change', ((e: CustomEvent) => {
			onchange(e.detail);
			// Treat change as a commit for custom fields (immediate action)
			oncommit?.(e.detail);
		}) as EventListener);

		// Also listen for explicit commit events from web components that distinguish commit from change
		el.addEventListener('commit', ((e: CustomEvent) => {
			oncommit?.(e.detail);
		}) as EventListener);

		containerEl.appendChild(el);
	}

	// Sync value changes from Svelte → web component
	$effect(() => {
		if (!containerEl) return;
		const el = containerEl.firstElementChild as (HTMLElement & { value?: unknown }) | null;
		if (el && 'value' in el) {
			el.value = value;
		}
	});

	onMount(() => {
		loadComponent();
	});
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

	{#if error}
		<div class="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
			{error}
		</div>
	{:else if !loaded}
		<div class="flex h-10 items-center justify-center rounded-lg border border-dashed border-border">
			<span class="text-xs text-muted-foreground">Loading custom field...</span>
		</div>
	{/if}

	<div bind:this={containerEl}></div>
</div>
