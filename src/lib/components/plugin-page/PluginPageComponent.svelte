<script lang="ts">
	import { auth } from '$lib/stores/auth.svelte';
	import { onMount } from 'svelte';

	interface Props {
		/** Plugin slug */
		slug: string;
	}

	let { slug }: Props = $props();

	let containerEl = $state<HTMLDivElement | null>(null);
	let loaded = $state(false);
	let error = $state('');

	const tagName = `grav-${slug}--page`;

	const loadingPromises: Record<string, Promise<void> | undefined> = ((window as any).__GRAV_PAGE_LOADING ??= {});

	function getScriptUrl(): string {
		return `${auth.serverUrl}${auth.apiPrefix}/gpm/plugins/${slug}/page-script`;
	}

	function getAuthHeaders(): Record<string, string> {
		const h: Record<string, string> = {};
		if (auth.accessToken) h['Authorization'] = `Bearer ${auth.accessToken}`;
		if (auth.environment) h['X-Grav-Environment'] = auth.environment;
		return h;
	}

	async function loadComponent() {
		if (customElements.get(tagName)) {
			loaded = true;
			mountElement();
			return;
		}

		if (loadingPromises[tagName]) {
			try {
				await loadingPromises[tagName];
				loaded = true;
				mountElement();
			} catch {
				error = `Failed to load page component for "${slug}"`;
			}
			return;
		}

		loadingPromises[tagName] = (async () => {
			const headers = getAuthHeaders();
			const response = await fetch(getScriptUrl(), { headers });
			if (!response.ok) {
				throw new Error(`Failed to load page component: ${response.statusText}`);
			}

			const code = await response.text();

			window.__GRAV_API_SERVER_URL = auth.serverUrl;
			window.__GRAV_API_PREFIX = auth.apiPrefix || '/api/v1';
			window.__GRAV_API_TOKEN = auth.accessToken;

			const blob = new Blob([
				`window.__GRAV_PAGE_TAG = ${JSON.stringify(tagName)};\n${code}`
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
			console.error(`[PluginPage] Failed to load ${slug}:`, err);
			error = `Failed to load page component for "${slug}"`;
		}
	}

	function mountElement() {
		if (!containerEl) return;
		containerEl.innerHTML = '';

		const el = document.createElement(tagName);
		containerEl.appendChild(el);
	}

	onMount(() => {
		loadComponent();
	});
</script>

{#if error}
	<div class="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
		{error}
	</div>
{:else if !loaded}
	<div class="flex h-40 items-center justify-center rounded-lg border border-dashed border-border">
		<span class="text-sm text-muted-foreground">Loading plugin page...</span>
	</div>
{/if}

<div bind:this={containerEl} class="min-h-0 flex-1"></div>
