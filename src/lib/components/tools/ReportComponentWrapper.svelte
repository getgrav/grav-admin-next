<script lang="ts">
	import type { ReportItem } from '$lib/api/endpoints/tools';
	import { auth } from '$lib/stores/auth.svelte';
	import { onMount } from 'svelte';

	interface Props {
		report: ReportItem;
	}

	let { report }: Props = $props();

	let containerEl = $state<HTMLDivElement | null>(null);
	let loaded = $state(false);
	let error = $state('');

	// Web component tag name: grav-{pluginSlug}--{reportId}
	const tagName = `grav-${report.provider}--${report.component}`;

	// Global loading lock — prevents multiple instances from loading the same script
	const loadingPromises: Record<string, Promise<void> | undefined> = ((window as any).__GRAV_REPORT_LOADING ??= {});

	function getScriptUrl(): string {
		return `${auth.serverUrl}${auth.apiPrefix}/gpm/plugins/${report.provider}/report-script/${report.component}`;
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
			} catch {
				error = `Failed to load report component "${report.component}"`;
			}
			return;
		}

		// First instance — load the script
		loadingPromises[tagName] = (async () => {
			const headers = getAuthHeaders();
			const response = await fetch(getScriptUrl(), { headers });
			if (!response.ok) {
				throw new Error(`Failed to load report component: ${response.statusText}`);
			}

			const code = await response.text();

			// Expose auth context as globals for web component API calls
			window.__GRAV_API_SERVER_URL = auth.serverUrl;
			window.__GRAV_API_PREFIX = auth.apiPrefix || '/api/v1';
			window.__GRAV_API_TOKEN = auth.accessToken;

			// Execute the module — it calls customElements.define(TAG, ...)
			const blob = new Blob([
				`window.__GRAV_REPORT_TAG = ${JSON.stringify(tagName)};\n${code}`
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
			// Clear cached promise so a retry (e.g. re-navigation) can try again
			delete loadingPromises[tagName];
			console.error(`[ReportComponent] Failed to load ${report.provider}/${report.component}:`, err);
			error = `Failed to load report component "${report.component}"`;
		}
	}

	function mountElement() {
		if (!containerEl) return;

		containerEl.innerHTML = '';

		const el = document.createElement(tagName) as HTMLElement & {
			report?: ReportItem;
		};

		// Pass the full report data to the web component
		el.report = report;
		containerEl.appendChild(el);
	}

	onMount(() => {
		loadComponent();
	});
</script>

{#if error}
	<div class="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
		{error}
	</div>
{:else if !loaded}
	<div class="flex h-16 items-center justify-center rounded-lg border border-dashed border-border">
		<span class="text-xs text-muted-foreground">Loading report component...</span>
	</div>
{/if}

<div bind:this={containerEl}></div>
