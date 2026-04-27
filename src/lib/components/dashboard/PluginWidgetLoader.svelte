<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import { api } from '$lib/api/client';
	import { Loader2, AlertTriangle } from 'lucide-svelte';
	import type { ResolvedWidget } from '$lib/dashboard/types';

	let { widget }: { widget: ResolvedWidget } = $props();

	let container: HTMLDivElement | undefined = $state();
	let loadState = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
	let error = $state<string | null>(null);

	const loadingPromises: Record<string, Promise<void> | undefined> =
		((window as { __GRAV_DASHBOARD_WIDGET_LOADING?: Record<string, Promise<void>> }).__GRAV_DASHBOARD_WIDGET_LOADING ??= {});

	function tagName(w: ResolvedWidget): string {
		// Derive a stable element tag from widget id: 'license-manager.summary' → 'grav-widget-license-manager-summary'
		const safe = w.id.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
		return `grav-widget-${safe}`;
	}

	async function ensureLoaded(w: ResolvedWidget): Promise<void> {
		const tag = tagName(w);
		if (customElements.get(tag)) return;

		if (!w.scriptUrl) throw new Error(`Plugin widget ${w.id} has no scriptUrl`);

		if (loadingPromises[tag]) {
			await loadingPromises[tag];
			return;
		}

		loadingPromises[tag] = (async () => {
			const code = await api.fetchScript(w.scriptUrl!);

			(window as any).__GRAV_API_SERVER_URL = auth.serverUrl;
			(window as any).__GRAV_API_PREFIX = auth.apiPrefix || '/api/v1';
			(window as any).__GRAV_API_TOKEN = auth.accessToken;

			const blob = new Blob([
				`window.__GRAV_WIDGET_TAG = ${JSON.stringify(tag)};\n${code}`,
			], { type: 'application/javascript' });
			const url = URL.createObjectURL(blob);
			try {
				await import(/* @vite-ignore */ url);
				await customElements.whenDefined(tag);
			} finally {
				URL.revokeObjectURL(url);
			}
		})();

		try {
			await loadingPromises[tag];
		} catch (err) {
			delete loadingPromises[tag];
			throw err;
		}
	}

	function mount(w: ResolvedWidget) {
		if (!container) return;
		const tag = tagName(w);
		container.innerHTML = '';
		const el = document.createElement(tag);
		el.setAttribute('size', w.size);
		if (w.dataEndpoint) el.setAttribute('data-endpoint', w.dataEndpoint);
		if (w.plugin) el.setAttribute('plugin', w.plugin);
		el.setAttribute('widget-id', w.id);
		container.appendChild(el);
	}

	$effect(() => {
		const w = widget;
		if (!container) return;
		loadState = 'loading';
		ensureLoaded(w).then(() => {
			loadState = 'ready';
			mount(w);
		}).catch((err: unknown) => {
			error = err instanceof Error ? err.message : String(err);
			loadState = 'error';
		});
	});

	// Keep token globals fresh in case the plugin widget reads them on demand
	$effect(() => {
		(window as any).__GRAV_API_SERVER_URL = auth.serverUrl;
		(window as any).__GRAV_API_PREFIX = auth.apiPrefix || '/api/v1';
		(window as any).__GRAV_API_TOKEN = auth.accessToken;
	});
</script>

<div bind:this={container} class="h-full">
	{#if loadState === 'loading'}
		<div class="flex h-full items-center justify-center rounded-lg border border-border bg-card p-4">
			<Loader2 size={16} class="animate-spin text-muted-foreground" />
		</div>
	{:else if loadState === 'error'}
		<div class="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-center">
			<AlertTriangle size={16} class="text-amber-500" />
			<p class="text-[12px] font-medium text-amber-600 dark:text-amber-400">{i18n.t('ADMIN_NEXT.PLUGIN_WIDGET_LOADER.WIDGET_FAILED_TO_LOAD')}</p>
			<p class="text-[10px] text-muted-foreground">{error}</p>
		</div>
	{/if}
</div>
