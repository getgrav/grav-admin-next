<script lang="ts">
	import { auth } from '$lib/stores/auth.svelte';
	import { floatingWidgetStore } from '$lib/stores/floatingWidgets.svelte';
	import { Bot } from 'lucide-svelte';

	// Icon mapping — maps icon names from the API to Lucide components
	const iconMap: Record<string, typeof Bot> = {
		bot: Bot,
	};

	// Track which widgets are open
	let openWidgets = $state<Record<string, boolean>>({});
	let widgetContainers = $state<Record<string, HTMLDivElement | null>>({});
	let loadedScripts = $state<Record<string, boolean>>({});

	const loadingPromises: Record<string, Promise<void> | undefined> = ((window as any).__GRAV_WIDGET_LOADING ??= {});

	function getScriptUrl(slug: string): string {
		return `${auth.serverUrl}${auth.apiPrefix}/gpm/plugins/${slug}/widget-script`;
	}

	function getAuthHeaders(): Record<string, string> {
		const h: Record<string, string> = {};
		if (auth.accessToken) h['Authorization'] = `Bearer ${auth.accessToken}`;
		if (auth.environment) h['X-Grav-Environment'] = auth.environment;
		return h;
	}

	// Track closing animation state
	let closingWidgets = $state<Record<string, boolean>>({});

	function toggleWidget(widgetId: string, pluginSlug: string) {
		if (openWidgets[widgetId]) {
			// Animate out, then unmount
			closingWidgets[widgetId] = true;
			setTimeout(() => {
				openWidgets[widgetId] = false;
				closingWidgets[widgetId] = false;
				unmountWidget(widgetId);
			}, 200);
		} else {
			openWidgets[widgetId] = true;
			// Wait for Svelte to create the container div via {#if} before mounting
			requestAnimationFrame(() => {
				if (!loadedScripts[widgetId]) {
					loadWidgetScript(widgetId, pluginSlug);
				} else {
					mountWidget(widgetId, pluginSlug);
				}
			});
		}
	}

	async function loadWidgetScript(widgetId: string, slug: string) {
		const tagName = `grav-${slug}--widget`;

		if (customElements.get(tagName)) {
			loadedScripts[widgetId] = true;
			mountWidget(widgetId, slug);
			return;
		}

		if (loadingPromises[tagName]) {
			try {
				await loadingPromises[tagName];
				loadedScripts[widgetId] = true;
				mountWidget(widgetId, slug);
			} catch {
				console.error(`[FloatingWidget] Failed to load ${slug}`);
			}
			return;
		}

		loadingPromises[tagName] = (async () => {
			const headers = getAuthHeaders();
			const response = await fetch(getScriptUrl(slug), { headers });
			if (!response.ok) {
				throw new Error(`Failed to load widget: ${response.statusText}`);
			}

			const code = await response.text();

			window.__GRAV_API_SERVER_URL = auth.serverUrl;
			window.__GRAV_API_PREFIX = auth.apiPrefix || '/api/v1';
			window.__GRAV_API_TOKEN = auth.accessToken;

			const blob = new Blob([
				`window.__GRAV_WIDGET_TAG = ${JSON.stringify(tagName)};\n${code}`
			], { type: 'application/javascript' });
			const blobUrl = URL.createObjectURL(blob);
			await import(/* @vite-ignore */ blobUrl);
			URL.revokeObjectURL(blobUrl);
			await customElements.whenDefined(tagName);
		})();

		try {
			await loadingPromises[tagName];
			loadedScripts[widgetId] = true;
			mountWidget(widgetId, slug);
		} catch (err) {
			console.error(`[FloatingWidget] Failed to load ${slug}:`, err);
		}
	}

	function mountWidget(widgetId: string, slug: string) {
		const container = widgetContainers[widgetId];
		if (!container) return;

		const tagName = `grav-${slug}--widget`;
		container.innerHTML = '';

		const el = document.createElement(tagName);

		// Listen for close event from the widget — animate out
		el.addEventListener('close', () => {
			closingWidgets[widgetId] = true;
			setTimeout(() => {
				openWidgets[widgetId] = false;
				closingWidgets[widgetId] = false;
				unmountWidget(widgetId);
			}, 200);
		});

		container.appendChild(el);
	}

	function unmountWidget(widgetId: string) {
		const container = widgetContainers[widgetId];
		if (container) container.innerHTML = '';
	}
</script>

{#if floatingWidgetStore.loaded && floatingWidgetStore.items.length > 0}
	{#each floatingWidgetStore.items as widget, i (widget.id)}
		<!-- Widget panel — positioned above the FAB -->
		{#if openWidgets[widget.id]}
			<div
				bind:this={widgetContainers[widget.id]}
				class="fw-panel fixed z-50 rounded-xl border border-border bg-popover shadow-2xl {closingWidgets[widget.id] ? 'fw-closing' : 'fw-opening'}"
				style="width: 420px; height: 580px; bottom: 76px; right: 20px;"
			></div>
		{/if}

		<!-- FAB button — always anchored at bottom-right -->
		<button
			class="fw-fab fixed z-50 flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg transition-all hover:scale-105 hover:shadow-xl active:scale-95"
			style="bottom: 20px; right: 20px; background: linear-gradient(135deg, #6366f1, #8b5cf6);"
			title={widget.label}
			onclick={() => toggleWidget(widget.id, widget.plugin)}
		>
			<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="10" x="3" y="11" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><circle cx="8" cy="16" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="16" r="1" fill="currentColor" stroke="none"/></svg>
		</button>
	{/each}
{/if}

<style>
	.fw-panel {
		transform-origin: bottom right;
	}
	.fw-opening {
		animation: fw-open 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
	}
	.fw-closing {
		animation: fw-close 0.2s cubic-bezier(0.4, 0, 1, 1) forwards;
	}
	@keyframes fw-open {
		0% {
			opacity: 0;
			transform: scale(0.4) translateY(20px);
		}
		100% {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}
	@keyframes fw-close {
		0% {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
		100% {
			opacity: 0;
			transform: scale(0.4) translateY(20px);
		}
	}
</style>
