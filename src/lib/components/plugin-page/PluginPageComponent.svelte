<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import { api } from '$lib/api/client';
	import { onMount } from 'svelte';

	interface Props {
		/** Plugin slug */
		slug: string;
		/**
		 * Called when the mounted web component reports its own dirty / validity /
		 * busy state via a `page-state` CustomEvent. Lets a component-mode page
		 * drive its toolbar action buttons (e.g. enable a primary Save) the same
		 * way a blueprint form drives them. All keys are optional and merged.
		 */
		onstate?: (state: { dirty?: boolean; valid?: boolean; busy?: boolean }) => void;
	}

	let { slug, onstate }: Props = $props();

	let containerEl = $state<HTMLDivElement | null>(null);
	let loaded = $state(false);
	let error = $state('');

	const tagName = `grav-${slug}--page`;

	const loadingPromises: Record<string, Promise<void> | undefined> = ((window as any).__GRAV_PAGE_LOADING ??= {});

	function getScriptPath(): string {
		return `/gpm/plugins/${slug}/page-script`;
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
			const code = await api.fetchScript(getScriptPath());

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
		// Mirror the context-panel / floating-widget wiring: let the web component
		// report state back to the host so it can drive the toolbar action buttons.
		el.addEventListener('page-state', ((e: CustomEvent) => {
			onstate?.(e.detail ?? {});
		}) as EventListener);
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
		<span class="text-sm text-muted-foreground">{i18n.t('ADMIN_NEXT.PLUGIN_PAGE_COMPONENT.LOADING_PLUGIN_PAGE')}</span>
	</div>
{/if}

<div bind:this={containerEl} class="min-h-0 flex-1"></div>
