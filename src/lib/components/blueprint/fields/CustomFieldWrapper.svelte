<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { customFieldRegistry } from '$lib/stores/customFields.svelte';
	import { loadPluginModule } from '$lib/utils/plugin-modules';
	import { contentLang } from '$lib/stores/contentLang.svelte';
	import { getContext, untrack } from 'svelte';
	import FieldHelp from '../FieldHelp.svelte';

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
		prepareFragment?: () => void;
		markFragmentSynced?: (markdown: string) => void;
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
		/**
		 * Reads another value in the form by its blueprint path. Handed to the web
		 * component as `el.getValue`. Inside a list row it is scoped to that row, so
		 * a sibling's path (`<list name>.<sibling>`) reads the sibling in the same row;
		 * a path the row doesn't hold is read from the enclosing row or the form.
		 */
		getValue?: (path: string) => unknown;
		/** Plugin or theme slug that provides this custom field */
		pluginSlug: string;
		/** Whether the provider is a plugin or a theme (selects the gpm route) */
		providerKind?: 'plugins' | 'themes';
		/** Field type name (used to resolve the script URL and element tag) */
		fieldType: string;
		/** Inline blueprint-validation error (e.g. empty required field). */
		error?: string;
		/**
		 * The web component draws its own heading from `field.label`, so this
		 * wrapper must not draw it too. The field is still handed over intact —
		 * the label it carries is already translated server-side, and blanking
		 * it left the component falling back to hardcoded English
		 * (trilbymedia/grav-plugin-flex-objects#236).
		 */
		selfLabeled?: boolean;
	}

	let { field, value, onchange, oncommit, getValue, pluginSlug, providerKind = 'plugins', fieldType, error: fieldError, selfLabeled = false }: Props = $props();
	const translateLabel = i18n.tMaybe;

	let containerEl = $state<HTMLDivElement | null>(null);
	let loaded = $state(false);
	let error = $state('');

	// Web component tag name: plugin-slug--field-type (must contain a hyphen)
	const tagName = `grav-${pluginSlug}--${fieldType}`;

	async function loadComponent() {
		try {
			// Each field type is its own module; one shared load per tag, so a
			// form with many fields of the same type imports it once.
			await loadPluginModule({
				type: 'field',
				slug: pluginSlug,
				kind: providerKind,
				name: fieldType,
				tag: tagName,
				version: customFieldRegistry.getProvider(fieldType)?.v,
			});
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
			getValue?: (path: string) => unknown;
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
			// Drop a fragment that Expert mode or a CodeMirror peer has left
			// behind Y.Text, so the editor seeds from the current markdown.
			collab.prepareFragment?.();
			el.yFragment = collab.fragment;
			el.yAwareness = collab.awareness;
			el.yUser = collab.user;
		}

		// Set properties. `getValue` goes on before the element connects, like
		// `field`, so it is there for the first render. It is a live accessor, not a
		// snapshot: always read it at the moment the value is needed.
		el.field = field;
		el.getValue = (path: string) => getValue?.(path);
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
			if (collab && typeof e.detail === 'string') collab.markFragmentSynced?.(e.detail);
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

	// Sync value changes from Svelte → web component. `value` is read before
	// any early exit: the element is appended after this effect's first run, so
	// a read behind the `el` check would leave `containerEl` as the only
	// dependency and the field would never see a new value after mount.
	$effect(() => {
		const v = value;
		const el = containerEl?.firstElementChild as (HTMLElement & { value?: unknown }) | null;
		if (el && 'value' in el) {
			el.value = v;
		}
	});

	// Tell a field when something it reads from the form has changed. A field opts
	// in by exposing `watch` (blueprint paths; a bare name such as `plugin` means
	// the sibling with that name) and a `formChanged()` method. It is called when
	// a watched value changes, not on the first read and not for any other change,
	// so a field that never opts in costs nothing here.
	let watchedSnapshot: string | null = null;
	$effect(() => {
		if (!loaded || !getValue) return;
		const el = containerEl?.firstElementChild as
			| (HTMLElement & { watch?: unknown; formChanged?: () => void })
			| null;
		if (!el || typeof el.formChanged !== 'function' || !Array.isArray(el.watch)) return;
		const base = field.name.includes('.') ? field.name.slice(0, field.name.lastIndexOf('.') + 1) : '';
		const snapshot = JSON.stringify(
			el.watch.map((p) => getValue(String(p).includes('.') ? String(p) : base + p) ?? null)
		);
		const changed = watchedSnapshot !== null && snapshot !== watchedSnapshot;
		watchedSnapshot = snapshot;
		if (changed) untrack(() => el.formChanged?.());
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
	{#if !selfLabeled && (field.label || field.help)}
		<div>
			{#if field.label}
				<label class="text-sm font-semibold text-foreground">
					{translateLabel(field.label)}
				</label>
			{/if}
			<FieldHelp help={field.help} label={field.label} />
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
