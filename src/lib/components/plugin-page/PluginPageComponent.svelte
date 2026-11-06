<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { loadPluginModule } from '$lib/utils/plugin-modules';
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
		/** Sub-path after /plugin/{slug}/, e.g. `orders` or `orders/42` */
		path?: string;
		/** Current query string, e.g. `?view=orders` */
		search?: string;
		/** The page module's version (`v` from the page definition). */
		version?: string | null;
	}

	let { slug, onstate, path = '', search = '', version = null }: Props = $props();

	let containerEl = $state<HTMLDivElement | null>(null);
	let loaded = $state(false);
	let error = $state('');

	const tagName = `grav-${slug}--page`;

	async function loadComponent() {
		try {
			await loadPluginModule({ type: 'page', slug, tag: tagName, version });
			loaded = true;
			mountElement();
		} catch (err) {
			console.error(`[PluginPage] Failed to load ${slug}:`, err);
			error = `Failed to load page component for "${slug}"`;
		}
	}

	let mounted: HTMLElement | null = null;
	let lastRoute = '';

	/** Hand the element the current sub-path as a `path` attribute and property. */
	function applyPath(el: HTMLElement) {
		el.setAttribute('path', path);
		(el as HTMLElement & { path?: string }).path = path;
	}

	function mountElement() {
		if (!containerEl) return;
		containerEl.innerHTML = '';

		const el = document.createElement(tagName);
		applyPath(el);
		// Mirror the context-panel / floating-widget wiring: let the web component
		// report state back to the host so it can drive the toolbar action buttons.
		el.addEventListener('page-state', ((e: CustomEvent) => {
			onstate?.(e.detail ?? {});
		}) as EventListener);
		containerEl.appendChild(el);
		mounted = el;
		lastRoute = `${path}${search}`;
	}

	// Moving between views of the same plugin page (a new sub-path or query
	// string) keeps the element mounted; it gets the new path and a
	// `route-change` event instead of having to watch location itself.
	$effect(() => {
		const route = `${path}${search}`;
		if (!mounted || route === lastRoute) return;
		lastRoute = route;
		applyPath(mounted);
		mounted.dispatchEvent(new CustomEvent('route-change', { detail: { path, search } }));
	});

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
