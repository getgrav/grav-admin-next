<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { auth } from '$lib/stores/auth.svelte';
	import { api } from '$lib/api/client';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { contentLang } from '$lib/stores/contentLang.svelte';
	import { getContext } from 'svelte';

	/**
	 * Optional collaborative-editing context. The page editor provides a
	 * lookup `(fieldName) => collab | null` so we can set Yjs collab
	 * properties on web-component fields (editor-pro, etc.) when collab
	 * is active for the current route. The factory returns null for
	 * fields that shouldn't participate (e.g. non-content fields).
	 */
	interface EditorCollab {
		fragment: unknown;
		awareness: unknown;
		user: { name: string; color: string };
	}
	type CollabCtx = (fieldName: string) => EditorCollab | null;
	const collabCtx = getContext<CollabCtx | undefined>('editorCollab');
	// When this field participates in collab and the room hasn't
	// connected yet, defer the first mount of the web component. If
	// we mounted in solo mode and then needed collab, we'd have to
	// destroy and rebuild the editor — flashing whatever the editor
	// happened to be displaying (often stale Y.XmlFragment content)
	// during the gap. The deferred mount lands once with the right
	// yFragment/yAwareness/yUser from the start.
	type CollabPendingCtx = (fieldName: string) => boolean;
	const collabPendingCtx = getContext<CollabPendingCtx | undefined>('collabPending');
	const collabPending = $derived(collabPendingCtx ? collabPendingCtx(field.name) : false);

	interface Props {
		field: BlueprintField;
		value: unknown;
		onchange: (value: unknown) => void;
		oncommit?: (value: unknown) => void;
		/** Plugin or theme slug that provides this custom field */
		pluginSlug: string;
		/** Whether the provider is a plugin or a theme (selects the gpm route) */
		providerKind?: 'plugins' | 'themes';
		/** Field type name (used to resolve the script URL and element tag) */
		fieldType: string;
		/** Inline blueprint-validation error (e.g. empty required field). */
		error?: string;
	}

	let { field, value, onchange, oncommit, pluginSlug, providerKind = 'plugins', fieldType, error: fieldError }: Props = $props();
	const translateLabel = i18n.tMaybe;

	let containerEl = $state<HTMLDivElement | null>(null);
	let loaded = $state(false);
	let error = $state('');

	// Web component tag name: plugin-slug--field-type (must contain a hyphen)
	const tagName = `grav-${pluginSlug}--${fieldType}`;

	// Global per-tag define lock — prevents multiple instances from defining the
	// same element twice.
	const loadingPromises: Record<string, Promise<void> | undefined> = ((window as any).__GRAV_FIELD_LOADING ??= {});

	// Global per-plugin bundle cache. A plugin's field scripts are fetched as one
	// bundle (`{ fieldType: code }`) so seven seo-magic fields cost one request
	// instead of seven; each field's code is then evaluated locally with its own
	// element tag. Keyed by `${kind}/${slug}`.
	const bundlePromises: Record<string, Promise<Record<string, string>> | undefined> =
		((window as any).__GRAV_FIELD_BUNDLES ??= {});

	function loadBundle(): Promise<Record<string, string>> {
		const key = `${providerKind}/${pluginSlug}`;
		let bundle = bundlePromises[key];
		if (!bundle) {
			bundle = api
				.fetchScript(`/gpm/${providerKind}/${pluginSlug}/fields`)
				.then((text) => JSON.parse(text) as Record<string, string>);
			bundlePromises[key] = bundle;
		}
		return bundle;
	}

	async function loadComponent() {
		// If the custom element is already defined, just mount
		if (customElements.get(tagName)) {
			loaded = true;
			mountElement();
			return;
		}

		// If another instance is already defining this tag, wait for it
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

		// First instance of this tag — pull the plugin's field bundle (shared
		// across all of its fields) and evaluate this field's module.
		loadingPromises[tagName] = (async () => {
			const scripts = await loadBundle();
			const code = scripts[fieldType];
			if (typeof code !== 'string') {
				throw new Error(`Field "${fieldType}" missing from ${pluginSlug} bundle`);
			}

			// Expose auth context as globals for web component API calls
			window.__GRAV_API_SERVER_URL = auth.serverUrl;
			window.__GRAV_API_PREFIX = auth.apiPrefix || '/api/v1';
			window.__GRAV_API_TOKEN = auth.accessToken;

			// Execute the module — it reads __GRAV_FIELD_TAG and calls
			// customElements.define(TAG, ...). Module bodies run synchronously, so
			// the tag set here is read before any other field's module evaluates.
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
			yFragment?: unknown;
			yAwareness?: unknown;
			yUser?: unknown;
		};

		// Collaboration (Phase 6): if the page editor's provider has a
		// shared Y.XmlFragment for this field, hand it over BEFORE the
		// element is connected to the DOM so the web component picks
		// it up in connectedCallback and builds the editor with the
		// y-prosemirror extension from the start.
		const collab = collabCtx?.(field.name);
		if (collab) {
			el.yFragment = collab.fragment;
			el.yAwareness = collab.awareness;
			el.yUser = collab.user;
		}

		// Set properties
		el.field = field;
		el.value = value;

		// Listen for value changes from the web component. The field's
		// value-change protocol is a CustomEvent dispatched on the element
		// itself (`this.dispatchEvent`), so its target is `el`. A light-DOM
		// field (e.g. seo-magic's title/description) that renders a plain
		// `<input>`/`<textarea>` also emits the native, bubbling `change`
		// event on blur — with `e.detail === undefined` — which would reach
		// this same listener and wipe the field value. Shadow-DOM fields
		// don't leak it (`change` has `composed: false`), so this guard makes
		// light-DOM fields behave the same: only honour events fired on the
		// element itself, not native ones bubbling up from inner controls.
		el.addEventListener('change', ((e: CustomEvent) => {
			if (e.target !== el) return;
			onchange(e.detail);
			// Treat change as a commit for custom fields (immediate action)
			oncommit?.(e.detail);
		}) as EventListener);

		// Also listen for explicit commit events from web components that distinguish commit from change
		el.addEventListener('commit', ((e: CustomEvent) => {
			if (e.target !== el) return;
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

	// Keep the active content language exposed as a global so custom fields can
	// read the current lang without reaching into our site-scoped localStorage.
	// Runs reactively — switching languages updates the global immediately, so
	// fields that re-read on each API call pick up the change without reload.
	$effect(() => {
		window.__GRAV_CONTENT_LANG = contentLang.activeLang;
	});

	// Defer initial loadComponent() until the collab room (if any) is
	// ready. Once collabPending flips false the effect runs and the
	// element mounts with collab props in place; if collab is off
	// entirely it runs on first call and we mount immediately.
	let mountStarted = $state(false);
	$effect(() => {
		if (collabPending) return;
		if (mountStarted) return;
		mountStarted = true;
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
				<p class="mt-0.5 text-xs text-muted-foreground">{@html translateLabel(field.help)}</p>
			{/if}
		</div>
	{/if}

	{#if error}
		<div class="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
			{error}
		</div>
	{:else if collabPending}
		<div class="flex h-64 items-center justify-center rounded-lg border border-border bg-card text-sm text-muted-foreground">
			<span class="animate-pulse">{i18n.t('ADMIN_NEXT.PAGES.EDIT.CONNECTING_TO_COLLAB')}</span>
		</div>
	{:else if !loaded}
		<div class="flex h-10 items-center justify-center rounded-lg border border-dashed border-border">
			<span class="text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.FIELDS.CUSTOM_FIELD_WRAPPER.LOADING_CUSTOM_FIELD')}</span>
		</div>
	{/if}

	<div bind:this={containerEl}></div>

	{#if fieldError}
		<p class="text-xs font-medium text-destructive" data-field-error>{fieldError}</p>
	{/if}
</div>
