<script lang="ts">
	import { tick } from 'svelte';
	import { api } from '$lib/api/client';
	import { auth } from '$lib/stores/auth.svelte';
	import { contextPanelStore } from '$lib/stores/contextPanels.svelte';

	const DEFAULT_WIDTH = 420;

	let panelContainer = $state<HTMLDivElement | null>(null);
	let loadedScripts: Record<string, boolean> = {};
	let mountedEl: HTMLElement | null = null;
	let closing = $state(false);
	let dynamicWidth = $state<number | null>(null);

	const loadingPromises: Record<string, Promise<void> | undefined> =
		((window as any).__GRAV_PANEL_LOADING ??= {});

	function getScriptPath(slug: string): string {
		return `/gpm/plugins/${slug}/panel-script`;
	}

	function getTagName(slug: string): string {
		return `grav-${slug}--panel`;
	}

	function handleClose() {
		closing = true;
		contextPanelStore.close(); // Close immediately so toggle() can open a new panel
		setTimeout(() => {
			if (!contextPanelStore.activePanel) {
				// Only unmount if no new panel was opened during animation
				unmount();
			}
			closing = false;
		}, 250);
	}

	function handleBackdropClick() {
		handleClose();
	}

	async function loadScript(panelId: string, slug: string) {
		const tagName = getTagName(slug);

		if (customElements.get(tagName)) {
			loadedScripts[panelId] = true;
			mount(slug);
			return;
		}

		if (loadingPromises[tagName]) {
			try {
				await loadingPromises[tagName];
				loadedScripts[panelId] = true;
				mount(slug);
			} catch {
				console.error(`[ContextPanel] Failed to load ${slug}`);
			}
			return;
		}

		loadingPromises[tagName] = (async () => {
			const code = await api.fetchScript(getScriptPath(slug));

			window.__GRAV_API_SERVER_URL = auth.serverUrl;
			window.__GRAV_API_PREFIX = auth.apiPrefix || '/api/v1';
			window.__GRAV_API_TOKEN = auth.accessToken;

			const blob = new Blob(
				[`window.__GRAV_PANEL_TAG = ${JSON.stringify(tagName)};\n${code}`],
				{ type: 'application/javascript' }
			);
			const blobUrl = URL.createObjectURL(blob);
			await import(/* @vite-ignore */ blobUrl);
			URL.revokeObjectURL(blobUrl);
			await customElements.whenDefined(tagName);
		})();

		try {
			await loadingPromises[tagName];
			loadedScripts[panelId] = true;
			mount(slug);
		} catch (err) {
			console.error(`[ContextPanel] Failed to load ${slug}:`, err);
		}
	}

	function mount(slug: string) {
		if (!panelContainer) return;

		const tagName = getTagName(slug);
		panelContainer.innerHTML = '';

		const el = document.createElement(tagName);

		// Set context attributes
		const ctx = contextPanelStore.context;
		if (ctx) {
			el.setAttribute('route', ctx.route);
			el.setAttribute('lang', ctx.lang);
			el.setAttribute('type', ctx.type);
		}

		// Listen for events from the web component
		el.addEventListener('close', () => handleClose());
		el.addEventListener('badge', ((e: CustomEvent) => {
			const panel = contextPanelStore.activePanel;
			if (panel && e.detail?.count !== undefined) {
				contextPanelStore.setBadge(panel, e.detail.count);
			}
		}) as EventListener);
		el.addEventListener('resize', ((e: CustomEvent) => {
			if (e.detail?.width) {
				dynamicWidth = e.detail.width;
			}
		}) as EventListener);

		panelContainer.appendChild(el);
		mountedEl = el;
	}

	function unmount() {
		if (panelContainer) panelContainer.innerHTML = '';
		mountedEl = null;
		dynamicWidth = null;
	}

	// When active panel changes, load/mount the web component
	$effect(() => {
		const panelId = contextPanelStore.activePanel;
		if (!panelId) return;

		const panel = contextPanelStore.getPanel(panelId);
		if (!panel) return;

		// Wait for Svelte to flush DOM updates (renders the {#if} container)
		tick().then(() => {
			if (contextPanelStore.activePanel !== panelId) return; // stale
			if (!loadedScripts[panelId]) {
				loadScript(panelId, panel.plugin);
			} else {
				mount(panel.plugin);
			}
		});
	});

	// Update context attributes when route/lang/type changes while panel is open
	$effect(() => {
		const ctx = contextPanelStore.context;
		if (mountedEl && ctx) {
			mountedEl.setAttribute('route', ctx.route);
			mountedEl.setAttribute('lang', ctx.lang);
			mountedEl.setAttribute('type', ctx.type);
		}
	});

	// Keep auth tokens in sync
	$effect(() => {
		window.__GRAV_API_SERVER_URL = auth.serverUrl;
		window.__GRAV_API_PREFIX = auth.apiPrefix || '/api/v1';
		window.__GRAV_API_TOKEN = auth.accessToken;
	});
</script>

{#if contextPanelStore.activePanel || closing}
	{@const panel = contextPanelStore.getPanel(contextPanelStore.activePanel ?? '')}
	{@const panelWidth = dynamicWidth ?? panel?.width ?? DEFAULT_WIDTH}

	<!-- Backdrop -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="cp-backdrop fixed inset-0 z-40 bg-black/40 {closing ? 'cp-backdrop-closing' : 'cp-backdrop-opening'}"
		onclick={handleBackdropClick}
	></div>

	<!-- Panel -->
	<div
		class="cp-panel fixed right-0 top-0 z-40 flex h-full flex-col border-l border-border bg-background shadow-2xl {closing ? 'cp-closing' : 'cp-opening'}"
		style="width: {panelWidth}px; max-width: 100vw; transition: width 0.25s cubic-bezier(0.16, 1, 0.3, 1);"
	>
		<div bind:this={panelContainer} class="flex-1 overflow-hidden"></div>
	</div>
{/if}

<style>
	.cp-backdrop-opening {
		animation: cp-fade-in 0.25s ease forwards;
	}
	.cp-backdrop-closing {
		animation: cp-fade-out 0.2s ease forwards;
	}
	@keyframes cp-fade-in {
		0% { opacity: 0; }
		100% { opacity: 1; }
	}
	@keyframes cp-fade-out {
		0% { opacity: 1; }
		100% { opacity: 0; }
	}

	.cp-opening {
		animation: cp-slide-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
	}
	.cp-closing {
		animation: cp-slide-out 0.2s cubic-bezier(0.4, 0, 1, 1) forwards;
	}
	@keyframes cp-slide-in {
		0% { transform: translateX(100%); }
		100% { transform: translateX(0); }
	}
	@keyframes cp-slide-out {
		0% { transform: translateX(0); }
		100% { transform: translateX(100%); }
	}
</style>
