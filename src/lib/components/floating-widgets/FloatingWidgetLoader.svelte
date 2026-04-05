<script lang="ts">
	import { auth } from '$lib/stores/auth.svelte';
	import { api } from '$lib/api/client';
	import { floatingWidgetStore } from '$lib/stores/floatingWidgets.svelte';
	import { Plus } from 'lucide-svelte';

	const DEFAULT_GRADIENT = 'linear-gradient(135deg, #6366f1, #8b5cf6)';
	const DEFAULT_WIDTH = 420;
	const DEFAULT_HEIGHT = 580;
	const FAB_SIZE = 48;
	const FAB_GAP = 12;
	const FAB_MARGIN = 20;
	const SPEED_DIAL_THRESHOLD = 3;

	// Normalize Font Awesome icon class: accept "bot", "fa-bot", or "fa-solid fa-bot"
	function faClass(icon: string): string {
		if (!icon) return 'fa-solid fa-robot';
		if (icon.includes('fa-solid') || icon.includes('fa-regular') || icon.includes('fa-brands')) return icon;
		const name = icon.startsWith('fa-') ? icon : 'fa-' + icon;
		return 'fa-solid ' + name;
	}

	// Speed dial state
	let speedDialOpen = $state(false);

	// Track which widgets are open
	let openWidgets = $state<Record<string, boolean>>({});
	let widgetContainers = $state<Record<string, HTMLDivElement | null>>({});
	let loadedScripts = $state<Record<string, boolean>>({});

	const loadingPromises: Record<string, Promise<void> | undefined> = ((window as any).__GRAV_WIDGET_LOADING ??= {});

	function getScriptPath(slug: string): string {
		return `/gpm/plugins/${slug}/widget-script`;
	}

	// Track closing animation state
	let closingWidgets = $state<Record<string, boolean>>({});

	function closeWidget(widgetId: string) {
		closingWidgets[widgetId] = true;
		setTimeout(() => {
			openWidgets[widgetId] = false;
			closingWidgets[widgetId] = false;
			unmountWidget(widgetId);
		}, 200);
	}

	function toggleWidget(widgetId: string, pluginSlug: string) {
		if (openWidgets[widgetId]) {
			closeWidget(widgetId);
		} else {
			// Close any other open panels first (exclusive open)
			for (const id of Object.keys(openWidgets)) {
				if (id !== widgetId && openWidgets[id]) {
					openWidgets[id] = false;
					closingWidgets[id] = false;
					unmountWidget(id);
				}
			}
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
			const code = await api.fetchScript(getScriptPath(slug));

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

	// Auto-load scripts for widgets with autoLoad: true (e.g., ai-translate injects
	// translate buttons into fields without waiting for the FAB to be clicked).
	// Use a plain Set (non-reactive) to guard against double-loading.
	const autoLoaded = new Set<string>();
	$effect(() => {
		if (!floatingWidgetStore.loaded) return;
		for (const w of floatingWidgetStore.items) {
			if (w.autoLoad && !autoLoaded.has(w.id)) {
				autoLoaded.add(w.id);
				loadWidgetScript(w.id, w.plugin);
			}
		}
	});

	// Keep the auth token global in sync with the auth store so widget scripts
	// always see the current token (tokens can refresh while the widget is loaded).
	$effect(() => {
		window.__GRAV_API_SERVER_URL = auth.serverUrl;
		window.__GRAV_API_PREFIX = auth.apiPrefix || '/api/v1';
		window.__GRAV_API_TOKEN = auth.accessToken;
	});
</script>

{#if floatingWidgetStore.loaded && floatingWidgetStore.items.length > 0}
	{@const visibleWidgets = floatingWidgetStore.items.filter(w => w.showFab !== false)}
	{@const useSpeedDial = visibleWidgets.length >= SPEED_DIAL_THRESHOLD}

	<!-- Widget panels (one open at a time — exclusive) -->
	{#each floatingWidgetStore.items as widget (widget.id)}
		{@const visibleIndex = visibleWidgets.findIndex(w => w.id === widget.id)}
		{@const fabBottom = useSpeedDial ? FAB_MARGIN : FAB_MARGIN + visibleIndex * (FAB_SIZE + FAB_GAP)}
		{@const panelWidth = widget.width ?? DEFAULT_WIDTH}
		{@const panelHeight = widget.height ?? DEFAULT_HEIGHT}
		{@const panelGradient = widget.gradient ?? DEFAULT_GRADIENT}
		{#if openWidgets[widget.id]}
			<div
				class="fw-panel fixed z-50 flex flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-2xl {closingWidgets[widget.id] ? 'fw-closing' : 'fw-opening'}"
				style="width: {panelWidth}px; height: {panelHeight}px; bottom: {fabBottom + FAB_SIZE + 8}px; right: {FAB_MARGIN}px;"
			>
				{#if widget.useStandardHeader !== false}
					<!-- Standard header — gradient + icon + title + close button -->
					<div
						class="flex flex-shrink-0 items-center justify-between px-3 py-2.5 text-white"
						style="background: {panelGradient};"
					>
						<div class="flex items-center gap-2">
							<div class="flex h-7 w-7 items-center justify-center rounded-md bg-white/20 backdrop-blur">
								<i class="{faClass(widget.icon)} text-sm leading-none"></i>
							</div>
							<div class="text-sm font-semibold">{widget.label}</div>
						</div>
						<button
							type="button"
							class="flex h-7 w-7 items-center justify-center rounded-md text-white/75 transition-colors hover:bg-white/15 hover:text-white"
							title="Close"
							onclick={() => closeWidget(widget.id)}
						>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
						</button>
					</div>
					<!-- Body — plugin content mounts here -->
					<div bind:this={widgetContainers[widget.id]} class="flex-1 overflow-auto"></div>
				{:else}
					<!-- Full panel — plugin provides its own chrome -->
					<div bind:this={widgetContainers[widget.id]} class="flex-1 overflow-hidden"></div>
				{/if}
			</div>
		{/if}
	{/each}

	{#if useSpeedDial}
		<!-- Speed dial: single launcher FAB that expands to show all widget FABs -->
		{#each visibleWidgets as widget, i (widget.id)}
			{@const dialBottom = FAB_MARGIN + (FAB_SIZE + FAB_GAP) * (i + 1)}
			<button
				class="fw-fab fw-dial-item fixed z-50 flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg transition-all hover:scale-105 active:scale-95 {speedDialOpen ? 'fw-dial-open' : 'fw-dial-closed'}"
				style="bottom: {dialBottom}px; right: {FAB_MARGIN}px; background: {widget.gradient ?? DEFAULT_GRADIENT}; --dial-delay: {i * 30}ms;"
				title={widget.label}
				onclick={() => { speedDialOpen = false; toggleWidget(widget.id, widget.plugin); }}
				tabindex={speedDialOpen ? 0 : -1}
				aria-hidden={!speedDialOpen}
			>
				<i class="{faClass(widget.icon)} text-base leading-none"></i>
			</button>
		{/each}

		<!-- Speed dial launcher -->
		<button
			class="fw-fab fixed z-50 flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg transition-all hover:scale-105 hover:shadow-xl active:scale-95"
			style="bottom: {FAB_MARGIN}px; right: {FAB_MARGIN}px; background: {DEFAULT_GRADIENT};"
			title={speedDialOpen ? 'Close' : 'Plugin widgets'}
			onclick={() => speedDialOpen = !speedDialOpen}
			aria-expanded={speedDialOpen}
		>
			<Plus size={22} class="transition-transform {speedDialOpen ? 'rotate-45' : ''}" />
		</button>

		{#if speedDialOpen}
			<!-- Click-outside backdrop -->
			<button class="fixed inset-0 z-40 cursor-default" aria-label="Close widgets menu" onclick={() => speedDialOpen = false}></button>
		{/if}
	{:else}
		<!-- Stacked FABs (2 or fewer visible widgets) -->
		{#each visibleWidgets as widget, i (widget.id)}
			{@const fabBottom = FAB_MARGIN + i * (FAB_SIZE + FAB_GAP)}
			<button
				class="fw-fab fixed z-50 flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg transition-all hover:scale-105 hover:shadow-xl active:scale-95"
				style="bottom: {fabBottom}px; right: {FAB_MARGIN}px; background: {widget.gradient ?? DEFAULT_GRADIENT};"
				title={widget.label}
				onclick={() => toggleWidget(widget.id, widget.plugin)}
			>
				<i class="{faClass(widget.icon)} text-base leading-none"></i>
			</button>
		{/each}
	{/if}
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
	.fw-dial-item {
		transform-origin: center;
		transition: opacity 0.2s ease, transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
		transition-delay: var(--dial-delay, 0ms);
	}
	.fw-dial-closed {
		opacity: 0;
		transform: scale(0.5) translateY(20px);
		pointer-events: none;
	}
	.fw-dial-open {
		opacity: 1;
		transform: scale(1) translateY(0);
		pointer-events: auto;
	}
</style>
