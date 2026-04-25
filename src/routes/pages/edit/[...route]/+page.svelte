<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { setContext } from 'svelte';
	import { getPage, updatePage, deletePage, movePage, copyPage, getChildren } from '$lib/api/endpoints/pages';
	import { createTranslation, syncTranslation, adoptPageLanguage } from '$lib/api/endpoints/languages';
	import { getPageBlueprint } from '$lib/api/endpoints/blueprints';
	import type { PageDetail } from '$lib/api/endpoints/pages';
	import type { BlueprintSchema } from '$lib/api/endpoints/blueprints';
	import type { MediaItem } from '$lib/api/endpoints/media';
	import type { PageMediaContext } from '$lib/components/media/types';
	import BlueprintForm from '$lib/components/blueprint/BlueprintForm.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import LanguageSwitcher from '$lib/components/ui/LanguageSwitcher.svelte';
	import { toast } from 'svelte-sonner';
	import {
		Save, Trash2, ArrowLeft, Code, Copy as CopyIcon,
		AlertCircle, ChevronDown, Loader2, Eye, ExternalLink, X, Undo2, Languages, Move
	} from 'lucide-svelte';
	import PageNavigator from '$lib/components/pages/PageNavigator.svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import { prefs } from '$lib/stores/preferences.svelte';
	import { contentLang } from '$lib/stores/contentLang.svelte';
	import { createAutoSaveManager } from '$lib/utils/auto-save.svelte';
	import MarkdownEditor from '$lib/components/editors/MarkdownEditor.svelte';
	import CodeEditor from '$lib/components/editors/CodeEditor.svelte';
	import PageMedia from '$lib/components/media/PageMedia.svelte';
	import yaml from 'js-yaml';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import UnsavedIndicator from '$lib/components/ui/UnsavedIndicator.svelte';
	import { createUnsavedGuard } from '$lib/utils/unsaved-guard.svelte';
	import Tabs from '$lib/components/ui/Tabs.svelte';
	import StickyHeader from '$lib/components/ui/StickyHeader.svelte';
	import PagesField from '$lib/components/blueprint/fields/PagesField.svelte';
	import SelectField from '$lib/components/blueprint/fields/SelectField.svelte';
	import { invalidations } from '$lib/stores/invalidation.svelte';
	import { onMount } from 'svelte';
	import ContextPanelTriggers from '$lib/components/context-panels/ContextPanelTriggers.svelte';
	import { canWrite } from '$lib/utils/permissions';
	import AccessDenied from '$lib/components/ui/AccessDenied.svelte';
	import { PollingProvider } from '$lib/sync/PollingProvider';
	import { MercureProvider } from '$lib/sync/MercureProvider';
	import { YDocManager, ORIGIN_REMOTE } from '$lib/sync/YDocManager';
	import { createFormBinding, type FormBinding } from '$lib/sync/bindings/formBinding';
	import { createEditorBinding, type EditorCollab } from '$lib/sync/bindings/editorBinding';
	import { tryInitRoom } from '$lib/sync/initRoom';
	import type { Peer, SyncProvider, SyncStatus } from '$lib/sync/SyncProvider';
	import * as Y from 'yjs';
	import { api as apiClient } from '$lib/api/client';
	import { pageEditorBar } from '$lib/stores/pageEditorBar.svelte';

	const canEditPages = $derived(canWrite('pages'));
	let accessDenied = $state(false);

	const route = $derived('/' + (page.params.route || ''));

	// Shared reactive media list — PageMedia writes to it, FilePickerField reads from it
	let pageMediaItems = $state<MediaItem[]>([]);
	function updatePageMedia(items: MediaItem[]) { pageMediaItems = items; }

	// Provide page route to child components (used by PageMedia field, etc.)
	setContext('pageRoute', () => route);
	// Scope for blueprint-upload destination resolution (`self@:` → page dir).
	setContext('blueprintScope', () => 'pages/' + route.replace(/^\//, ''));
	// Expose page route globally for custom field web components (e.g., editor-pro)
	$effect(() => {
		window.__GRAV_PAGE_ROUTE = route;
		return () => { window.__GRAV_PAGE_ROUTE = ''; };
	});
	// Expose active content language for plugin scripts (e.g., ai-translate)
	$effect(() => {
		window.__GRAV_CONTENT_LANG = contentLang.activeLang;
		return () => { window.__GRAV_CONTENT_LANG = ''; };
	});

	// Editor integration events for floating widgets (e.g., AI chat)
	$effect(() => {
		function handleGetContent() {
			window.dispatchEvent(new CustomEvent('grav:editor:content-response', {
				detail: { content, route, title, template },
			}));
		}
		function handleInsertContent(e: CustomEvent) {
			const { content: newContent, mode } = e.detail || {};
			if (!newContent) return;

			const oldContent = content;
			let updatedContent: string;
			if (mode === 'replace') {
				updatedContent = newContent;
			} else if (mode === 'append') {
				updatedContent = content + '\n\n' + newContent;
			} else {
				return; // 'insert-at-cursor' is handled by MarkdownEditor directly
			}

			// Update Svelte state
			content = updatedContent;
			headerData = { ...headerData, content: updatedContent };

			// Directly update editor-pro web component (TipTap).
			// CodeMirror (MarkdownEditor) handles the event directly via its own listener.
			const editorPro = document.querySelector('grav-editor-pro--editor-pro') as (HTMLElement & { value?: string }) | null;
			if (editorPro) {
				editorPro.value = updatedContent;
			}

			// Trigger auto-save commit
			autoSave.oncommit('content', updatedContent, oldContent);
		}
		window.addEventListener('grav:editor:get-content', handleGetContent);
		window.addEventListener('grav:editor:insert-content', handleInsertContent as EventListener);
		return () => {
			window.removeEventListener('grav:editor:get-content', handleGetContent);
			window.removeEventListener('grav:editor:insert-content', handleInsertContent as EventListener);
		};
	});
	// Provide page type context (standard vs modular) for template selectors
	setContext('pageType', () => template?.startsWith('modular') ? 'modular' : 'standard');
	// Provide shared media list + updater so file pickers see uploads without saving
	setContext('pageMediaItems', {
		get items() { return pageMediaItems; },
		update: updatePageMedia,
	});

	let pageData = $state<PageDetail | null>(null);
	let blueprint = $state<BlueprintSchema | null>(null);
	let loading = $state(true);
	let saving = $state(false);
	let error = $state('');
	let showRawEditor = $state(false);
	let showNavigator = $state(false);

	// Guard against concurrent loadPage() calls — only the latest one applies
	let loadGeneration = 0;

	// Preview
	let showFrontendPreview = $state(false);
	const frontendPreviewUrl = $derived(pageData ? `${auth.serverUrl}${pageData.route}` : '');

	// Editable fields
	let title = $state('');
	let content = $state('');
	let template = $state('');
	let headerData = $state<Record<string, unknown>>({});
	let headerChanges = $state<Record<string, unknown>>({});
	let headerYaml = $state('');
	let expertFrontmatter = $state('');
	let expertFrontmatterOriginal = $state('');

	// Expert mode tabs & advanced fields
	let expertTab = $state<'content' | 'advanced'>('content');
	let expertSlug = $state('');
	let expertParent = $state('');

	// --- Collaborative editing (sync plugin) --------------------------
	// Per-tab stable client id so presence dedupes across reloads of the same tab.
	const syncClientId = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
		? crypto.randomUUID()
		: Math.random().toString(36).slice(2);
	let syncBinding: FormBinding | null = null;
	/**
	 * Phase 6: editor-level collab artifacts (Y.XmlFragment + Awareness).
	 * Provided to web-component editors via Svelte context so y-prosemirror
	 * can take over TipTap's document state. Null when collab is off.
	 */
	let editorCollab = $state<EditorCollab | null>(null);
	setContext('editorCollab', (fieldName: string): EditorCollab | null => {
		// Only the 'content' field is collaborative at this time. Other
		// custom fields (icon pickers, pages fields, etc.) are unaffected.
		return fieldName === 'content' ? editorCollab : null;
	});
	let syncReady = $state(false);
	/**
	 * Guard flag: set while we're applying a remote sync snapshot to Svelte
	 * state so our own $effect watchers don't push the same values back out
	 * on the wire. Not needed for the (path, value) push-on-change callers
	 * (they only fire for user-driven changes), but important for the
	 * `content` prop-change watcher.
	 */
	let applyingRemote = false;
	let syncStatus = $state<SyncStatus>('idle');
	let syncDetail = $state<string | undefined>(undefined);
	let syncPeers = $state<Peer[]>([]);

	// Drive a Y.Doc for this page whenever collab is enabled and the page is
	// loaded. Teardown on route change / disable / unmount.
	$effect(() => {
		const enabled = prefs.collabEnabled;
		const loaded = !loading && pageData !== null;
		const currentRoute = route;
		const currentLang = contentLang.enabled ? contentLang.activeLang : null;
		const currentTemplate = template || 'default';

		if (!enabled || !loaded || !currentRoute) return;

		const roomId = currentLang
			? `${currentRoute.replace(/^\//, '')}.${currentLang}@${currentTemplate}`
			: `${currentRoute.replace(/^\//, '')}@${currentTemplate}`;

		// All construction below happens inside an async IIFE because the
		// capability fetch (Polling vs Mercure) needs to settle before we
		// can pick a provider. References used by the cleanup closure are
		// declared in this outer scope so teardown can null-check them
		// regardless of which await point we were at.
		type Capabilities = {
			transports?: string[];
			preferred?: string;
			mercure?: { hub: string };
		};

		let provider: SyncProvider | null = null;
		let mgr: YDocManager | null = null;
		let binding: FormBinding | null = null;
		let editorBoundary: ReturnType<typeof createEditorBinding> | null = null;
		let offRemote: (() => void) | null = null;

		let cancelled = false;

		(async () => {
			// 1) Pick the transport. Mercure when the API advertises it;
			//    polling otherwise. Capability fetch is best-effort — any
			//    failure cleanly falls back to polling.
			let useMercure = false;
			try {
				const caps = await apiClient.get<Capabilities>('/sync/capabilities');
				useMercure =
					caps.preferred === 'mercure' &&
					Array.isArray(caps.transports) &&
					caps.transports.includes('mercure') &&
					!!caps.mercure?.hub;
			} catch { /* fall back to polling */ }
			if (cancelled) return;

			const providerOpts = {
				roomId,
				route: currentRoute,
				lang: currentLang,
				clientId: syncClientId,
				user: auth.fullname || auth.username || null,
			};
			provider = useMercure ? new MercureProvider(providerOpts) : new PollingProvider(providerOpts);
			provider.onStatus((s, d) => { syncStatus = s; syncDetail = d; });
			provider.onPeers((p) => { syncPeers = p; });

			// 2) Wire the YDocManager + FormBinding around the chosen provider.
			mgr = new YDocManager({
				roomId,
				clientId: syncClientId,
				user: auth.fullname || auth.username || null,
				provider,
			});
			binding = createFormBinding({
				doc: mgr.doc,
				blueprint,
				extraRichTextPaths: ['content'],
				localOrigin: mgr.localOrigin,
				remoteOrigin: Symbol('ydoc:remote-unused'),
			});

			// 3) Snapshot apply path. Defined here (closes over the local
			//    `editorBoundary` ref so the editor-active guard reads the
			//    right value).
			async function applyRemoteSnapshot(snap: Record<string, unknown>): Promise<void> {
				applyingRemote = true;
				try {
					const prevContent = content;
					const newContent = typeof snap.content === 'string' ? snap.content : content;
					const newHeader = (snap.header && typeof snap.header === 'object')
						? (snap.header as Record<string, unknown>)
						: {};
					const newTitle = typeof newHeader.title === 'string' ? newHeader.title : title;
					const newTemplate = typeof snap.name === 'string' ? snap.name : template;

					if (newContent !== content) content = newContent;
					if (newTitle !== title) title = newTitle;
					const snapJson = JSON.stringify(snap);
					if (snapJson !== JSON.stringify(headerData)) {
						headerData = { ...snap };
					}
					if (pageData && pageData.content !== newContent) pageData.content = newContent;

					if (newTemplate !== template) {
						template = newTemplate;
						try { blueprint = await getPageBlueprint(newTemplate); } catch { blueprint = null; }
					}

					if (!editorCollab) {
						const editorPro = document.querySelector('grav-editor-pro--editor-pro') as (HTMLElement & { value?: string }) | null;
						if (editorPro && editorPro.value !== newContent) editorPro.value = newContent;
						type CmViewHandle = { state: { doc: { toString(): string; length: number } }; dispatch(tr: unknown): void };
						document.querySelectorAll<HTMLElement & { __cmView?: CmViewHandle }>('.cm-editor').forEach((el) => {
							const cm = el.__cmView;
							if (!cm) return;
							const doc = cm.state.doc.toString();
							if (doc !== prevContent || doc === newContent) return;
							cm.dispatch({ changes: { from: 0, to: cm.state.doc.length, insert: newContent } });
						});
					}
				} finally {
					applyingRemote = false;
				}
			}

			offRemote = binding.onRemote((snap) => { void applyRemoteSnapshot(snap); });

			// 4) Connect, seed-or-adopt, then build per-editor collab.
			try {
				await mgr.connect();
				if (cancelled) return;
				if (binding.map.size === 0) {
					// Two clients opening the same fresh page would each see
					// an empty doc here and both push their own seed update,
					// double-applying initial state. The server arbitrates
					// under flock — we build the seed in a temp doc, post it,
					// and only apply locally on a confirmed win. The loser
					// path absorbs the winner's bytes inline so we don't need
					// an extra pull round-trip.
					const tempDoc = new Y.Doc();
					const tempBinding = createFormBinding({
						doc: tempDoc,
						blueprint,
						extraRichTextPaths: ['content'],
						localOrigin: Symbol('seed:local'),
						remoteOrigin: Symbol('seed:remote'),
					});
					tempBinding.seed({ ...headerData, content });
					const seedBytes = Y.encodeStateAsUpdate(tempDoc);
					tempBinding.dispose();
					tempDoc.destroy();

					await tryInitRoom({
						doc: mgr.doc,
						route: currentRoute,
						lang: currentLang,
						clientId: syncClientId,
						seedBytes,
						remoteOrigin: ORIGIN_REMOTE,
					});
					if (cancelled) return;
				}
				// Whether we won, lost, or the room was already populated,
				// the live doc now reflects the canonical state.
				await applyRemoteSnapshot(binding.getValue());
				const contentText = binding.getText('content');
				if (contentText) {
					editorBoundary = createEditorBinding({
						doc: mgr.doc,
						clientId: syncClientId,
						userName: auth.fullname || auth.username || 'Anonymous',
						contentText,
					});
					editorCollab = editorBoundary.collab;
					provider.setAwareness?.(editorBoundary.collab.awareness);
				}
				syncBinding = binding;
				syncReady = true;
			} catch {
				/* leave room cold; status already reflects error */
			}
		})();

		return () => {
			cancelled = true;
			offRemote?.();
			syncReady = false;
			syncBinding = null;
			editorCollab = null;
			syncStatus = 'idle';
			syncPeers = [];
			binding?.dispose();
			editorBoundary?.dispose();
			mgr?.dispose();
		};
	});

	// Expert-mode content editor writes directly to the `content` state
	// (bypassing handleBlueprintChange). Keep this $effect so those edits
	// still propagate through Yjs. Normal-mode field edits go through
	// handleBlueprintChange which calls syncBinding.pushLocal directly.
	$effect(() => {
		if (!syncReady || !syncBinding || applyingRemote) return;
		syncBinding.pushLocal('content', content);
	});

	function deriveParent(route: string, slug: string): string {
		if (route === '/' + slug) return '/';
		return route.slice(0, route.lastIndexOf('/')) || '/';
	}

	// Publish presence + Normal/Expert handles to the global topbar so the
	// AppShell renders them up there instead of cramming them into this
	// page's already-busy toolbar. Both slots clear when the route unmounts
	// so other pages get a clean header.
	$effect(() => {
		if (prefs.collabEnabled && syncReady) {
			pageEditorBar.setPresence({
				peers: syncPeers,
				clientId: syncClientId,
				status: syncStatus,
				detail: syncDetail,
			});
		} else {
			pageEditorBar.setPresence(null);
		}
	});
	$effect(() => {
		pageEditorBar.setModeToggle({
			onNormal: () => { if (prefs.editorMode === 'expert') switchToNormal(); },
			onExpert: () => { if (prefs.editorMode === 'normal') switchToExpert(); },
		});
		return () => {
			pageEditorBar.setModeToggle(null);
			pageEditorBar.setPresence(null);
		};
	});

	// Sync state when switching between Normal and Expert modes
	function switchToExpert() {
		// Build current header from blueprint changes
		const currentHeader = { ...(pageData?.header ?? {}), title };
		if (Object.keys(headerChanges).length > 0) {
			for (const [dotPath, val] of Object.entries(headerChanges)) {
				const parts = dotPath.split('.');
				let current: Record<string, unknown> = currentHeader;
				for (let i = 0; i < parts.length - 1; i++) {
					if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
						current[parts[i]] = {};
					}
					current = current[parts[i]] as Record<string, unknown>;
				}
				current[parts[parts.length - 1]] = val;
			}
		}
		expertFrontmatter = yaml.dump(currentHeader, { lineWidth: -1, noRefs: true }).trimEnd();
		if (pageData) {
			expertSlug = pageData.slug.replace(/^\.+/, '');
			expertParent = deriveParent(pageData.route, pageData.slug);
		}
		expertTab = 'content';
		prefs.editorMode = 'expert';
	}

	function switchToNormal() {
		// Parse YAML back into header data
		try {
			const parsed = yaml.load(expertFrontmatter) as Record<string, unknown>;
			if (parsed && typeof parsed === 'object') {
				title = (parsed.title as string) ?? title;
				headerData = { header: { ...parsed }, content, folder: pageData?.slug ?? '', name: template };
				headerChanges = {};
				// Mark all fields as changed so save picks them up
				for (const [key, val] of Object.entries(parsed)) {
					if (key !== 'title') {
						headerChanges[key] = val;
					}
				}
			}
		} catch {
			toast.error('Invalid YAML frontmatter');
			return;
		}
		prefs.editorMode = 'normal';
	}

	let hasChanges = $derived(
		pageData !== null && (
			content !== (pageData.content ?? '') ||
			template !== pageData.template ||
			(prefs.editorMode === 'expert'
				? expertFrontmatter !== expertFrontmatterOriginal ||
				  expertSlug !== pageData.slug ||
				  expertParent !== deriveParent(pageData.route, pageData.slug)
				: title !== pageData.title || Object.keys(headerChanges).length > 0)
		)
	);

	const guard = createUnsavedGuard(() => {
		if (prefs.autoSaveEnabled) {
			return hasChanges || autoSave.saving || autoSave.undoStack.some(e => !e.savedToServer);
		}
		return hasChanges;
	});

	const autoSave = createAutoSaveManager({
		save: handleSave,
		getValue: (path: string) => {
			if (path === 'expertSlug') return expertSlug;
			if (path === 'expertParent') return expertParent;
			if (path === 'expertFrontmatter') return expertFrontmatter;
			const parts = path.split('.');
			let current: unknown = headerData;
			for (const part of parts) {
				if (current === null || current === undefined || typeof current !== 'object') return undefined;
				current = (current as Record<string, unknown>)[part];
			}
			return current;
		},
		applyChange: (path: string, value: unknown) => {
			if (path === 'expertSlug') { expertSlug = value as string; return; }
			if (path === 'expertParent') { expertParent = value as string; return; }
			if (path === 'expertFrontmatter') { expertFrontmatter = value as string; return; }
			handleBlueprintChange(path, value);
		},
		formName: 'Page',
		// Block saves while viewing a translation fallback — otherwise the
		// PATCH would clobber the source-language file. Manual Save routes
		// to handleSaveAsTranslation instead (see Save button onclick).
		canSave: () => !isFallback,
	});

	let saveAsOpen = $state(false);
	let headerHeight = $state(0);
	// Treat null/empty language as the default language (file is e.g. default.md with no .en. extension)
	const effectiveLang = $derived(pageData?.language || contentLang.defaultLang);
	let isFallback = $derived(contentLang.enabled && pageData !== null && effectiveLang !== contentLang.activeLang);
	// True when we're viewing a fallback AND the active lang can be created as
	// a new translation. In this state the Save button creates the translation
	// (even with no edits — copies fallback content as the seed).
	let canCreateTranslation = $derived(
		isFallback && !!pageData?.untranslated_languages?.includes(contentLang.activeLang)
	);

	// Languages offered in the "Save as …" dropdown. Combines the page's
	// untranslated_languages (server view) with an "adopt" entry for the site
	// default language when the page is backed by a bare `default.md` and the
	// default lang doesn't yet have an explicit `default.<lang>.md` — without
	// this, Grav reports the default lang as "translated" (because default.md
	// falls back for it) and the dropdown would never let the user convert
	// legacy single-language pages into proper language-suffixed files.
	const saveAsLanguages = $derived.by(() => {
		if (!pageData || !contentLang.enabled) return [] as string[];
		const untranslated = pageData.untranslated_languages ?? [];
		const explicitFiles = pageData.explicit_language_files ?? [];
		const out = [...untranslated];
		const def = contentLang.defaultLang;
		if (pageData.has_default_file && def && !explicitFiles.includes(def) && !out.includes(def)) {
			out.unshift(def);
		}
		return out;
	});

	async function loadPage(lang?: string) {
		const gen = ++loadGeneration;
		loading = true;
		error = '';
		accessDenied = false;
		try {
			// Home-page alias: `/` is the public route but the API requires the
			// structural route (raw_route, typically `/home`). Resolve it via the
			// children-of-root listing and redirect so subsequent loads use the
			// canonical URL.
			if (route === '/' || route === '') {
				const roots = await getChildren('/');
				const home = roots.find((p) => p.route === '/' && p.raw_route);
				if (home?.raw_route) {
					const target = home.raw_route.startsWith('/') ? home.raw_route.slice(1) : home.raw_route;
					goto(`${base}/pages/edit/${target}`, { replaceState: true });
					return;
				}
			}
			const activeLang = lang ?? (contentLang.enabled ? contentLang.activeLang : undefined);
			const data = await getPage(route, { render: false, translations: true, lang: activeLang });

			// Stale load — a newer loadPage() was triggered while this one was in flight
			if (gen !== loadGeneration) return;

			pageData = data;
			title = data.title;
			content = data.content ?? '';
			template = data.template;
			headerData = { header: { ...data.header ?? {}, title: data.title }, content: data.content ?? '', folder: data.slug, name: data.template };
			headerYaml = JSON.stringify(data.header ?? {}, null, 2);
			expertFrontmatter = yaml.dump({ ...(data.header ?? {}), title: data.title }, { lineWidth: -1, noRefs: true }).trimEnd();
			expertFrontmatterOriginal = expertFrontmatter;

			// Initialize expert advanced state (strip any leading periods from slug)
			expertSlug = data.slug.replace(/^\.+/, '');
			expertParent = deriveParent(data.route, data.slug);
			expertTab = 'content';

			// Load blueprint for the page template (falls back to default on API side)
			try {
				blueprint = await getPageBlueprint(data.template);
			} catch {
				blueprint = null;
			}

			// Final stale check after blueprint load
			if (gen !== loadGeneration) return;
		} catch (err: unknown) {
			if (gen !== loadGeneration) return;
			const status = err && typeof err === 'object' && 'status' in err
				? (err as { status: number }).status : 0;
			if (status === 403) {
				accessDenied = true;
			} else if (status === 404) {
				error = `Page not found: ${route}`;
			} else {
				error = 'Failed to load page';
			}
		} finally {
			if (gen === loadGeneration) {
				loading = false;
			}
		}
	}

	async function handleBlueprintChange(path: string, value: unknown) {
		// While we're applying a remote sync snapshot, treat any blueprint
		// onchange as an echo of the new prop value we just set — not a
		// real user edit. Short-circuit so it doesn't fight the snapshot:
		//   - pushLocal would race the concurrent Y.Map update
		//   - headerChanges / headerData mutations below would clobber the
		//     snapshot-derived headerData we're trying to install
		if (applyingRemote) return;

		// Collab: every blueprint field change is pushed into the Y.Map so
		// peers receive it. The FormBinding no-ops when the value hasn't
		// actually changed (internal equality / text-diff check).
		if (syncReady && syncBinding) {
			syncBinding.pushLocal(path, value);
		}

		// Sync special fields back to their state variables
		if (path === 'content') {
			content = value as string;
		} else if (path === 'header.title') {
			title = value as string;
		} else if (path === 'name') {
			// Template changed — reload the blueprint for the new template
			const newTemplate = value as string;
			template = newTemplate;
			try {
				blueprint = await getPageBlueprint(newTemplate);
			} catch {
				blueprint = null;
			}
		}

		// Track header field changes for save
		if (path.startsWith('header.')) {
			const headerPath = path.slice(7); // Remove 'header.' prefix
			if (value === undefined) {
				const next = { ...headerChanges };
				delete next[headerPath];
				headerChanges = next;
			} else {
				headerChanges = { ...headerChanges, [headerPath]: value };
			}
		}

		// Apply the value change to headerData immutably
		const parts = path.split('.');
		const newData = { ...headerData };
		let current: Record<string, unknown> = newData;
		for (let i = 0; i < parts.length - 1; i++) {
			if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
				current[parts[i]] = {};
			}
			current[parts[i]] = { ...(current[parts[i]] as Record<string, unknown>) };
			current = current[parts[i]] as Record<string, unknown>;
		}
		current[parts[parts.length - 1]] = value;
		headerData = newData;
	}

	async function handleSave() {
		if (!pageData) return;
		saving = true;
		error = '';

		try {
			const body: Record<string, unknown> = {};

			if (prefs.editorMode === 'expert') {
				// Expert mode: parse YAML frontmatter and send full header
				try {
					const parsed = yaml.load(expertFrontmatter) as Record<string, unknown>;
					if (parsed && typeof parsed === 'object') {
						body.title = (parsed.title as string) ?? title;
						body.header = parsed;
					}
				} catch {
					toast.error('Invalid YAML frontmatter — fix syntax before saving');
					saving = false;
					return;
				}
				if (content !== (pageData.content ?? '')) body.content = content;
				if (template !== pageData.template) body.template = template;
			} else {
				// Normal mode: diff-based save
				if (title !== pageData.title) body.title = title;
				if (content !== (pageData.content ?? '')) body.content = content;
				if (template !== pageData.template) body.template = template;
			}

			// Include header changes from blueprint form fields (normal mode only)
			if (prefs.editorMode !== 'expert' && Object.keys(headerChanges).length > 0) {
				// Build nested header object from dot-notation keys
				const header: Record<string, unknown> = {};
				for (const [dotPath, val] of Object.entries(headerChanges)) {
					const parts = dotPath.split('.');
					let current = header;
					for (let i = 0; i < parts.length - 1; i++) {
						if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
							current[parts[i]] = {};
						}
						current = current[parts[i]] as Record<string, unknown>;
					}
					current[parts[parts.length - 1]] = val;
				}
				body.header = header;
			}

			// Check if a move is also needed (expert mode: slug or parent changed)
			const expertNeedsMove = prefs.editorMode === 'expert' && pageData && (
				expertSlug !== pageData.slug ||
				expertParent !== deriveParent(pageData.route, pageData.slug)
			);

			if (Object.keys(body).length === 0 && !expertNeedsMove) {
				toast.info('No changes to save');
				return;
			}

			// Phase 1: Save content/header/template changes
			if (Object.keys(body).length > 0) {
				const activeLang = contentLang.enabled ? contentLang.activeLang : undefined;
				const updated = await updatePage(route, body, undefined, activeLang);
				// Preserve translation data since PATCH response doesn't include it
				updated.translated_languages = updated.translated_languages ?? pageData!.translated_languages;
				updated.untranslated_languages = updated.untranslated_languages ?? pageData!.untranslated_languages;
				pageData = updated;
				title = updated.title;
				content = updated.content ?? content;
				template = updated.template;
				headerData = { header: { ...updated.header ?? {}, title: updated.title }, content: updated.content ?? '', folder: updated.slug, name: updated.template };
				headerChanges = {};

				// Reload blueprint if template changed
				if (body.template) {
					try {
						blueprint = await getPageBlueprint(updated.template);
					} catch {
						blueprint = null;
					}
				}

				// Reset expert mode baseline after save
				if (prefs.editorMode === 'expert') {
					expertFrontmatterOriginal = expertFrontmatter;
				}
			}

			// Phase 2: Move page if slug or parent changed (expert mode)
			if (expertNeedsMove && pageData) {
				const moveBody: { parent: string; slug?: string; order?: number | null } = {
					parent: expertParent,
				};
				if (expertSlug !== pageData.slug) moveBody.slug = expertSlug;

				const moved = await movePage(route, moveBody);

				// Sync all state so hasChanges becomes false
				pageData = moved;
				title = moved.title ?? title;
				content = moved.content ?? content;
				template = moved.template ?? template;
				expertSlug = moved.slug;
				expertParent = deriveParent(moved.route, moved.slug);
				expertFrontmatterOriginal = expertFrontmatter;
				headerChanges = {};

				if (moved.route !== route) {
					toast.success('Page saved and moved');
					guard.bypass();
					const newEditRoute = moved.route.startsWith('/') ? moved.route.slice(1) : moved.route;
					goto(`${base}/pages/edit/${newEditRoute}`, { replaceState: true });
					saving = false;
					return;
				}
				await loadPage();
			}

			toast.success('Page saved successfully');
		} catch (err: unknown) {
			if (err && typeof err === 'object' && 'message' in err) {
				toast.error((err as { message: string }).message);
			} else {
				toast.error('Failed to save page');
			}
		} finally {
			saving = false;
		}
	}

	async function handleSaveAsTranslation(targetLang: string) {
		if (!pageData) return;
		saving = true;
		saveAsOpen = false;
		try {
			// Special case: page has a bare `default.md` (implicit default-lang
			// content) and the user is claiming it as the site's default language.
			// Rename the file in place (default.md → default.<defaultLang>.md)
			// instead of creating a copy that would leave the untyped base file
			// behind as a fallback. Key signal: no explicit default.<lang>.md
			// file exists yet — regardless of whether Grav reports the lang as
			// "translated" (it will, because default.md covers it).
			const explicitFiles = pageData.explicit_language_files ?? [];
			const isAdoptCase = !!pageData.has_default_file
				&& targetLang === contentLang.defaultLang
				&& !explicitFiles.includes(targetLang);
			if (isAdoptCase) {
				await adoptPageLanguage(route, targetLang);
				toast.success(`Saved as ${contentLang.getLanguageName(targetLang)}`);
				autoSave.reset();
				headerChanges = {};
				await loadPage(targetLang);
				contentLang.setLanguage(targetLang);
				return;
			}

			const header = { ...pageData.header ?? {}, title };
			if (Object.keys(headerChanges).length > 0) {
				for (const [dotPath, val] of Object.entries(headerChanges)) {
					const parts = dotPath.split('.');
					let current: Record<string, unknown> = header;
					for (let i = 0; i < parts.length - 1; i++) {
						if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
							current[parts[i]] = {};
						}
						current = current[parts[i]] as Record<string, unknown>;
					}
					current[parts[parts.length - 1]] = val;
				}
			}

			await createTranslation(route, {
				lang: targetLang,
				title,
				content,
				header,
			});
			toast.success(`${contentLang.getLanguageName(targetLang)} translation created`);
			autoSave.reset();
			headerChanges = {};
			await loadPage(targetLang);
			contentLang.setLanguage(targetLang);
		} catch (err: unknown) {
			if (err && typeof err === 'object' && 'message' in err) {
				toast.error((err as { message: string }).message);
			} else {
				toast.error('Failed to create translation');
			}
		} finally {
			saving = false;
		}
	}

	// Sync confirmation state
	let confirmSyncOpen = $state(false);
	let pendingSyncSource = $state('');

	function handleSyncFrom(sourceLang: string) {
		if (!pageData) return;
		pendingSyncSource = sourceLang;
		confirmSyncOpen = true;
	}

	async function confirmSync() {
		confirmSyncOpen = false;
		const sourceLang = pendingSyncSource;
		const targetLang = contentLang.activeLang;
		const sourceName = contentLang.getLanguageName(sourceLang);
		const targetName = contentLang.getLanguageName(targetLang);
		saving = true;
		try {
			await syncTranslation(route, sourceLang, targetLang);
			toast.success(`${targetName} reset from ${sourceName}`);
			autoSave.reset();
			headerChanges = {};
			await loadPage(targetLang);
		} catch (err: unknown) {
			if (err && typeof err === 'object' && 'message' in err) {
				toast.error((err as { message: string }).message);
			} else {
				toast.error('Failed to sync translation');
			}
		} finally {
			saving = false;
		}
	}

	// Language switch with unsaved changes confirmation
	let confirmLangSwitchOpen = $state(false);
	let pendingLangSwitch = $state('');

	function handleLanguageSwitch(lang: string) {
		if (hasChanges) {
			pendingLangSwitch = lang;
			confirmLangSwitchOpen = true;
			return;
		}
		doLanguageSwitch(lang);
	}

	function doLanguageSwitch(lang: string) {
		contentLang.setLanguage(lang);
		autoSave.reset();
		headerChanges = {};
		loadPage(lang);
	}

	let confirmDeleteOpen = $state(false);

	function handleDelete() {
		if (!pageData) return;
		confirmDeleteOpen = true;
	}

	async function confirmDeletePage() {
		confirmDeleteOpen = false;
		try {
			await deletePage(route, { children: true });
			toast.success('Page deleted');
			goto(`${base}/pages`);
		} catch {
			toast.error('Failed to delete page');
		}
	}

	let copying = $state(false);

	/**
	 * Duplicate the current page, mirroring admin-classic's taskCopy() behavior:
	 * pick the next free `slug-N` under the same parent, copy the folder, then
	 * increment the trailing number in the title (or append ` 2`).
	 */
	async function handleCopy() {
		if (!pageData || !canEditPages || copying) return;
		copying = true;
		try {
			const originalRoute = pageData.route;
			const originalSlug = pageData.slug;
			const parentRoute = originalRoute === '/' ? '/' : (originalRoute.substring(0, originalRoute.lastIndexOf('/')) || '/');

			// Strip a trailing -N from the current slug to get the base, then start numbering from N+1 (or 2 if none).
			const slugMatch = originalSlug.match(/^(.*?)(?:-(\d+))?$/);
			const baseSlug = slugMatch?.[1] || originalSlug;
			const startN = slugMatch?.[2] ? Number(slugMatch[2]) + 1 : 2;

			const siblings = await getChildren(parentRoute);
			const existingSlugs = new Set(siblings.map((p) => p.slug));
			let n = startN;
			while (existingSlugs.has(`${baseSlug}-${n}`)) n++;
			const newSlug = `${baseSlug}-${n}`;
			const destination = parentRoute === '/' ? `/${newSlug}` : `${parentRoute}/${newSlug}`;

			const newPage = await copyPage(originalRoute, destination);

			// Increment trailing number in the title (matches admin-classic).
			const titleMatch = pageData.title.match(/^(.*?)(\d+)\s*$/);
			const newTitle = titleMatch ? `${titleMatch[1]}${Number(titleMatch[2]) + 1}` : `${pageData.title} 2`;
			try {
				await updatePage(newPage.route, { title: newTitle });
			} catch {
				// Non-fatal: folder was copied, title update failed.
			}

			toast.success('Page copied');
			goto(`${base}/pages/edit${newPage.route}`);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			toast.error(`Copy failed: ${msg}`);
		} finally {
			copying = false;
		}
	}

	/**
	 * Route Save to the correct action:
	 *  - In fallback mode (viewing English while active lang is French with no
	 *    French file yet): create the translation instead of clobbering source.
	 *  - Otherwise: normal save path (auto-save force or manual handleSave).
	 */
	function triggerSave() {
		if (canCreateTranslation) {
			handleSaveAsTranslation(contentLang.activeLang);
			return;
		}
		if (prefs.autoSaveEnabled) autoSave.forceSave();
		else handleSave();
	}

	function handleKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 's') {
			e.preventDefault();
			triggerSave();
		}
		if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey && prefs.autoSaveEnabled) {
			const tag = (document.activeElement?.tagName ?? '').toLowerCase();
			const isEditable = tag === 'input' || tag === 'textarea' || (document.activeElement as HTMLElement)?.isContentEditable;
			if (!isEditable) {
				e.preventDefault();
				autoSave.undo();
			}
		}
	}

	$effect(() => { autoSave.reset(); loadPage(); });

	// Refetch when this page is updated elsewhere (with dirty guard). The
	// dirtyGuard skips our own saves — the server's X-Invalidates fires the
	// event back at us before handleSave has cleared hasChanges, which would
	// otherwise toast on every save.
	onMount(() => {
		const unsub = invalidations.subscribe('pages:update', (e) => {
			if (e.id !== route) return;
			if (!hasChanges) loadPage();
			else toast.info('Page changed elsewhere — save to overwrite or reload');
		}, {
			dirtyGuard: () => saving || autoSave.saving,
		});
		return () => { unsub(); };
	});
</script>

<svelte:head>
	<title>{title || 'Edit Page'} — Grav Admin</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div style="--sticky-header-height: {headerHeight}px">
	<StickyHeader bind:height={headerHeight}>
		{#snippet children({ scrolled })}
			<div class="px-6 transition-[padding] duration-200 {scrolled ? 'py-2' : 'pt-6 pb-3'}">
				<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 {scrolled ? 'sm:min-h-6' : 'sm:min-h-8'}">
					<div class="flex min-w-0 items-center gap-3">
						<button class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground" onclick={() => goto(`${base}/pages`)}>
							<ArrowLeft size={16} />
						</button>
						<div class="min-w-0">
							{#if loading}
								<div class="h-6 w-48 animate-pulse rounded bg-muted"></div>
							{:else}
								<div class="flex items-center gap-2">
									<h1 class="truncate font-semibold text-foreground transition-[font-size] duration-200 {scrolled ? 'text-sm' : 'text-lg'}">{title || 'Untitled'}</h1>
									{#if contentLang.enabled && effectiveLang}
										<Badge variant={isFallback ? 'secondary' : 'default'} class="uppercase text-[10px]">{effectiveLang}</Badge>
									{/if}
								</div>
								{#if !scrolled}
									<p class="truncate text-xs text-muted-foreground">{route}</p>
								{/if}
							{/if}
						</div>
					</div>

					<div class="flex shrink-0 flex-wrap items-center gap-2">
			<UnsavedIndicator
				hasChanges={hasChanges}
				saving={autoSave.saving}
				lastSavedAt={autoSave.lastSavedAt}
				autoSaveEnabled={prefs.autoSaveEnabled}
			/>
			{#if prefs.autoSaveEnabled && prefs.autoSaveToolbarUndo && autoSave.canUndo}
				<Button variant="outline" size="sm" class="px-2 lg:px-3" title="Undo" onclick={() => autoSave.undo()}>
					<Undo2 size={14} />
					<span class="hidden lg:inline">Undo</span>
				</Button>
			{/if}
			<!-- Context panel triggers (e.g., revisions) -->
			<ContextPanelTriggers context="pages" route={route} lang={contentLang.activeLang} />
			<!-- Page navigator toggle -->
			<button
				class="inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors
					{showNavigator
						? 'border-primary bg-primary/10 text-primary'
						: 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'}"
				onclick={() => showNavigator = !showNavigator}
				title="Toggle page navigator"
			>
				<Move size={14} />
			</button>
			<!-- Preview, Copy, Delete — always icon-only -->
			<Button variant="outline" size="icon" class="h-8 w-8" title="Preview page" onclick={() => showFrontendPreview = true} disabled={loading || !pageData}>
				<Eye size={14} />
			</Button>
			{#if canEditPages}
				<Button variant="outline" size="icon" class="h-8 w-8" title="Copy page" onclick={handleCopy} disabled={loading || copying || !pageData}>
					{#if copying}
						<Loader2 size={14} class="animate-spin" />
					{:else}
						<CopyIcon size={14} />
					{/if}
				</Button>
				<Button variant="destructive" size="icon" class="h-8 w-8" title="Delete page" onclick={handleDelete} disabled={loading}>
					<Trash2 size={14} />
				</Button>
			{/if}
			{#if contentLang.enabled}
				<LanguageSwitcher compact translatedLangs={pageData?.translated_languages ? Object.keys(pageData.translated_languages) : undefined} onchange={handleLanguageSwitch} />
			{/if}
			<!-- Save button with Save As dropdown -->
			{#if canEditPages}
			<div class="relative flex">
				<Button size="sm" class="px-2 lg:px-3 {(hasChanges || canCreateTranslation) ? '' : 'opacity-50 pointer-events-none'} {saveAsLanguages.length > 0 ? 'rounded-r-none' : ''}" title={saving ? 'Saving…' : canCreateTranslation ? `Save as ${contentLang.getLanguageName(contentLang.activeLang)}` : 'Save'} onclick={triggerSave} disabled={saving || loading}>
					{#if saving}
						<Loader2 size={14} class="animate-spin" />
						<span class="hidden lg:inline">Saving...</span>
					{:else if canCreateTranslation}
						<Languages size={14} />
						<span class="hidden lg:inline">Save as {contentLang.getLanguageName(contentLang.activeLang)}</span>
					{:else}
						<Save size={14} />
						<span class="hidden lg:inline">Save</span>
					{/if}
				</Button>
				{#if saveAsLanguages.length > 0}
					<button
						class="inline-flex h-8 items-center rounded-r-md border-l border-primary-foreground/20 bg-primary px-1.5 text-primary-foreground transition-colors hover:bg-primary/90"
						onclick={() => saveAsOpen = !saveAsOpen}
						disabled={saving || loading}
					>
						<ChevronDown size={12} />
					</button>
					{#if saveAsOpen}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="fixed inset-0 z-40" onclick={() => saveAsOpen = false}></div>
						<div class="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-md border border-border bg-popover py-1 shadow-md">
							{#each saveAsLanguages as lang}
								<button
									class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-popover-foreground transition-colors hover:bg-accent/50"
									onclick={() => handleSaveAsTranslation(lang)}
								>
									<Languages size={14} class="text-muted-foreground" />
									Save as {contentLang.getLanguageName(lang)}
								</button>
							{/each}
						</div>
					{/if}
				{/if}
			</div>
			{/if}
		</div>
				</div>
			</div>
		{/snippet}
	</StickyHeader>

	<div class="relative z-0 space-y-4 px-6 pb-6">
		{#if accessDenied}
		<AccessDenied message="You don't have permission to view this page." />
	{:else if error}
		<div class="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950/30 dark:text-red-300">
			<AlertCircle size={16} />
			{error}
		</div>
	{/if}

	{#if isFallback}
		<div class="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300">
			<Languages size={16} class="shrink-0" />
			<span>No {contentLang.getLanguageName(contentLang.activeLang)} translation exists. Viewing {contentLang.getLanguageName(effectiveLang)} fallback. Use "Save as {contentLang.getLanguageName(contentLang.activeLang)}" to create a translation you can edit.</span>
			{#if pageData?.untranslated_languages?.includes(contentLang.activeLang)}
				<button class="shrink-0 ml-auto text-xs font-medium underline" onclick={() => handleSaveAsTranslation(contentLang.activeLang)}>
					Save as {contentLang.getLanguageName(contentLang.activeLang)}
				</button>
			{/if}
		</div>
	{/if}

	{#if loading}
		<div class="py-20 text-center text-sm text-muted-foreground">Loading page...</div>
	{:else if pageData}
		<div class="grid gap-4 lg:grid-cols-[1fr_280px]">
			<!-- Main content area -->
			<div class="space-y-4">
				{#if prefs.editorMode === 'expert'}
					<!-- Expert mode tabs -->
					<Tabs
						items={[{ id: 'content', label: 'Content' }, { id: 'advanced', label: 'Advanced' }]}
						active={expertTab}
						onchange={(id) => { expertTab = id as 'content' | 'advanced'; }}
					/>

					{#if expertTab === 'content'}
						<!-- Content tab: frontmatter + markdown + media -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="overflow-hidden rounded-lg border border-border bg-card"
							onfocusout={() => { if (prefs.autoSaveEnabled && expertFrontmatter !== expertFrontmatterOriginal) autoSave.oncommit('expertFrontmatter', expertFrontmatter, expertFrontmatterOriginal); }}
						>
							<div class="flex items-center gap-2 border-b border-border px-4 py-2">
								<Code size={13} class="text-muted-foreground" />
								<span class="text-xs font-medium text-muted-foreground">Frontmatter</span>
							</div>
							<CodeEditor
								value={expertFrontmatter}
								onchange={(v) => { expertFrontmatter = v; }}
								language="yaml"
								minHeight="150px"
								maxHeight="500px"
								class="rounded-none border-0 shadow-none"
							/>
						</div>
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="overflow-hidden rounded-lg border border-border bg-card"
							onfocusout={() => { if (prefs.autoSaveEnabled && content !== (pageData?.content ?? '')) autoSave.oncommit('content', content, pageData?.content ?? ''); }}
						>
							{#key editorCollab ? 'collab' : 'solo'}
								<MarkdownEditor
									value={content}
									onchange={(v) => { content = v; }}
									placeholder="Write your markdown content here..."
									minHeight="400px"
									class="border-0 shadow-none"
									yText={editorCollab?.yText ?? null}
									yAwareness={editorCollab?.awareness ?? null}
									yUser={editorCollab?.user ?? null}
								/>
							{/key}
						</div>
						<div class="rounded-lg border border-border bg-card p-4">
							<PageMedia {route} onMediaChange={updatePageMedia} externalItems={pageMediaItems} />
						</div>
					{:else if expertTab === 'advanced'}
						<!-- Advanced tab: filesystem-level properties -->
						<div class="space-y-6 rounded-lg border border-border bg-card p-6">
							<div class="space-y-2">
								<div>
									<span class="text-sm font-semibold text-foreground">
										Folder Name <span class="text-red-500">*</span>
									</span>
									<p class="mt-0.5 text-xs text-muted-foreground">The folder name on disk (URL slug)</p>
								</div>
								<input
									type="text"
									class="flex h-10 w-full rounded-lg border border-input bg-muted/50 px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
									value={expertSlug}
									oninput={(e) => { expertSlug = (e.target as HTMLInputElement).value.toLowerCase().replace(/\s/g, '-').replace(/[^a-z0-9_\-]/g, ''); }}
									onfocusout={() => {
										if (prefs.autoSaveEnabled && expertSlug && expertSlug !== pageData?.slug) {
											autoSave.oncommit('expertSlug', expertSlug, pageData?.slug);
										}
									}}
								/>
							</div>

							<PagesField
								field={{ name: 'route', type: 'pages', label: 'Parent', show_root: true, show_slug: true }}
								value={expertParent}
								onchange={(v) => {
									expertParent = v as string;
									if (prefs.autoSaveEnabled && pageData) {
										const orig = deriveParent(pageData.route, pageData.slug);
										if (v !== orig) autoSave.oncommit('expertParent', v, orig);
									}
								}}
							/>

							<SelectField
								field={{ name: 'name', type: 'select', label: 'Display Template',
									data_options: '\\Grav\\Plugin\\AdminPlugin::pagesTypes',
									validate: { required: true } }}
								value={template}
								onchange={(v) => {
									const old = template;
									template = v as string;
									getPageBlueprint(v as string).then(bp => { blueprint = bp; }).catch(() => { blueprint = null; });
									if (prefs.autoSaveEnabled && v !== pageData?.template) {
										autoSave.oncommit('template', v, old);
									}
								}}
							/>
						</div>
					{/if}
				{:else if blueprint}
					<!-- Normal mode: Blueprint-driven form. Re-key on collab
					     transition so MarkdownField's CodeMirror remounts and
					     picks up the now-available yText prop. -->
					{#key blueprint.name + (editorCollab ? '|collab' : '|solo')}
						<BlueprintForm
							fields={blueprint.fields}
							data={headerData}
							onchange={handleBlueprintChange}
							oncommit={autoSave.oncommit}
						/>
					{/key}
				{:else}
					<!-- Fallback when no blueprint is available -->
					<div class="rounded-lg border border-border bg-card p-4">
						<label class="label">
							<span class="text-sm font-medium text-foreground">Title</span>
							<input
								type="text"
								class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
								bind:value={title}
							/>
						</label>
					</div>
					{#key editorCollab ? 'collab' : 'solo'}
						<MarkdownEditor
							value={content}
							onchange={(v) => { content = v; }}
							placeholder="Write your markdown content here..."
							minHeight="400px"
							yText={editorCollab?.yText ?? null}
							yAwareness={editorCollab?.awareness ?? null}
							yUser={editorCollab?.user ?? null}
						/>
					{/key}
				{/if}
			</div>

			<!-- Sidebar -->
			<div class="space-y-4 lg:sticky lg:self-start" style="top: calc(var(--sticky-header-height, 0px) + 1rem)">
				<!-- Page Status & Info -->
				<div class="rounded-lg border border-border bg-card p-4">
					<h3 class="mb-3 text-sm font-semibold text-foreground">Page Info</h3>
					<dl class="space-y-2.5 text-[13px]">
						<!-- Status indicators -->
						<div class="flex justify-between">
							<dt class="flex items-center gap-1.5 text-muted-foreground">
								{#if pageData.published}
									<span class="h-2 w-2 rounded-full bg-emerald-500"></span>
								{:else}
									<span class="h-2 w-2 rounded-full bg-muted-foreground/40"></span>
								{/if}
								Published
							</dt>
							<dd class="font-medium {pageData.published ? 'text-emerald-500' : 'text-muted-foreground'}">
								{pageData.published ? 'Yes' : 'No'}
							</dd>
						</div>
						<div class="flex justify-between">
							<dt class="flex items-center gap-1.5 text-muted-foreground">
								{#if pageData.visible}
									<span class="h-2 w-2 rounded-full bg-primary"></span>
								{:else}
									<span class="h-2 w-2 rounded-full bg-muted-foreground/40"></span>
								{/if}
								Visible in nav
							</dt>
							<dd class="font-medium {pageData.visible ? 'text-primary' : 'text-muted-foreground'}">
								{pageData.visible ? 'Yes' : 'No'}
							</dd>
						</div>
						{#if pageData.routable !== undefined}
							<div class="flex justify-between">
								<dt class="text-muted-foreground">Routable</dt>
								<dd class="font-medium {pageData.routable ? 'text-foreground' : 'text-muted-foreground'}">
									{pageData.routable ? 'Yes' : 'No'}
								</dd>
							</div>
						{/if}

						<div class="my-1 border-t border-border"></div>

						<!-- Page details -->
						<div class="flex justify-between">
							<dt class="text-muted-foreground">Route</dt>
							<dd class="max-w-[140px] truncate font-medium text-foreground" title={pageData.route}>{pageData.route}</dd>
						</div>
						<div class="flex justify-between">
							<dt class="text-muted-foreground">Slug</dt>
							<dd class="font-medium text-foreground">{pageData.slug}</dd>
						</div>
						<div class="flex justify-between">
							<dt class="text-muted-foreground">Template</dt>
							<dd class="font-medium text-foreground">{pageData.template}</dd>
						</div>
						{#if contentLang.enabled}
							<div class="flex justify-between">
								<dt class="text-muted-foreground">Language</dt>
								<dd class="font-medium text-foreground">{effectiveLang?.toUpperCase()}{#if isFallback} <span class="text-amber-500 text-[11px]">(fallback)</span>{/if}</dd>
							</div>
						{/if}
						{#if pageData.order}
							<div class="flex justify-between">
								<dt class="text-muted-foreground">Order</dt>
								<dd class="font-medium text-foreground">{pageData.order}</dd>
							</div>
						{/if}

						<div class="my-1 border-t border-border"></div>

						<!-- Dates -->
						{#if pageData.date}
							<div class="flex justify-between">
								<dt class="text-muted-foreground">Date</dt>
								<dd class="font-medium text-foreground">{new Date(pageData.date).toLocaleDateString()}</dd>
							</div>
						{/if}
						<div class="flex justify-between">
							<dt class="text-muted-foreground">Modified</dt>
							<dd class="font-medium text-foreground">{new Date(pageData.modified).toLocaleString()}</dd>
						</div>
						{#if pageData.header?.publish_date}
							<div class="flex justify-between">
								<dt class="text-muted-foreground">Publish on</dt>
								<dd class="font-medium text-emerald-500">{new Date(pageData.header.publish_date as string).toLocaleString()}</dd>
							</div>
						{/if}
						{#if pageData.header?.unpublish_date}
							<div class="flex justify-between">
								<dt class="text-muted-foreground">Unpublish on</dt>
								<dd class="font-medium text-amber-500">{new Date(pageData.header.unpublish_date as string).toLocaleString()}</dd>
							</div>
						{/if}
					</dl>
				</div>

				<!-- Translations (shown when multilang enabled) -->
				{#if contentLang.enabled && (pageData.translated_languages || pageData.untranslated_languages)}
					<div class="rounded-lg border border-border bg-card p-4">
						<h3 class="mb-3 text-sm font-semibold text-foreground">Translations</h3>
						<div class="space-y-1.5">
							{#if pageData.translated_languages}
								{#each Object.keys(pageData.translated_languages) as lang}
									<button
										class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors
											{lang === contentLang.activeLang ? 'bg-accent font-medium text-accent-foreground' : 'text-foreground hover:bg-accent/50'}"
										onclick={() => handleLanguageSwitch(lang)}
									>
										<span class="inline-flex h-5 w-6 items-center justify-center rounded text-[10px] font-bold uppercase
											{lang === contentLang.activeLang ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}"
										>{lang}</span>
										{contentLang.getLanguageName(lang)}
										{#if lang === contentLang.activeLang}
											<span class="ml-auto text-[10px] text-muted-foreground">current</span>
										{/if}
									</button>
								{/each}
							{/if}
							{#if pageData.untranslated_languages && pageData.untranslated_languages.length > 0}
								<div class="my-1 border-t border-border"></div>
								<p class="px-2 text-[11px] text-muted-foreground">Not translated:</p>
								{#each pageData.untranslated_languages as lang}
									<button
										class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
										onclick={() => handleSaveAsTranslation(lang)}
									>
										<span class="inline-flex h-5 w-6 items-center justify-center rounded bg-muted/50 text-[10px] font-bold uppercase text-muted-foreground/50"
										>{lang}</span>
										<span class="italic">Create {contentLang.getLanguageName(lang)}</span>
									</button>
								{/each}
							{/if}
							{#if !contentLang.isDefault && pageData.translated_languages && Object.keys(pageData.translated_languages).length > 1}
								<div class="my-1 border-t border-border"></div>
								<p class="px-2 text-[11px] text-muted-foreground">Reset content from:</p>
								{#each Object.keys(pageData.translated_languages).filter(l => l !== contentLang.activeLang) as lang}
									<button
										class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
										onclick={() => handleSyncFrom(lang)}
									>
										<span class="inline-flex h-5 w-6 items-center justify-center rounded bg-amber-500/15 text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400"
										>{lang}</span>
										Reset from {contentLang.getLanguageName(lang)}
									</button>
								{/each}
							{/if}
						</div>
					</div>
				{/if}

				<!-- Page Media (shown when no blueprint provides a pagemedia field, not in expert mode) -->
				{#if !blueprint && prefs.editorMode !== 'expert'}
					<div class="rounded-lg border border-border bg-card p-4">
						<PageMedia {route} onMediaChange={updatePageMedia} externalItems={pageMediaItems} />
					</div>
				{/if}
			</div>
		</div>
	{/if}
	</div>
</div>

<ConfirmModal
	open={confirmDeleteOpen}
	title="Delete Page"
	message={`Delete "${pageData?.title}" at ${route}? This cannot be undone.`}
	confirmLabel="Delete"
	variant="destructive"
	onconfirm={confirmDeletePage}
	oncancel={() => { confirmDeleteOpen = false; }}
/>

<ConfirmModal
	open={guard.showModal}
	title="Unsaved Changes"
	message="You have unsaved changes. Leave anyway?"
	confirmLabel="Leave"
	cancelLabel="Stay"
	onconfirm={guard.confirm}
	oncancel={guard.cancel}
/>

<ConfirmModal
	open={confirmSyncOpen}
	title="Reset Translation"
	message={`This will overwrite all ${contentLang.getLanguageName(contentLang.activeLang)} content and header fields with the ${contentLang.getLanguageName(pendingSyncSource)} version. You can then re-translate the content.`}
	confirmLabel="Reset"
	variant="destructive"
	onconfirm={confirmSync}
	oncancel={() => { confirmSyncOpen = false; }}
/>

<ConfirmModal
	open={confirmLangSwitchOpen}
	title="Unsaved Changes"
	message="You have unsaved changes. Switch language anyway?"
	confirmLabel="Switch"
	onconfirm={() => { confirmLangSwitchOpen = false; doLanguageSwitch(pendingLangSwitch); }}
	oncancel={() => { confirmLangSwitchOpen = false; }}
/>

<!-- Frontend Preview Modal -->
{#if showFrontendPreview && frontendPreviewUrl}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/80 p-4 backdrop-blur-sm sm:p-6"
		onclick={(e) => { if (e.target === e.currentTarget) showFrontendPreview = false; }}
	>
		<div class="flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
			<!-- Header -->
			<div class="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
				<div class="flex items-center gap-3">
					<h2 class="text-sm font-semibold text-foreground">Page Preview</h2>
					<span class="truncate text-xs text-muted-foreground">{frontendPreviewUrl}</span>
				</div>
				<div class="flex items-center gap-2">
					<a
						href={frontendPreviewUrl}
						target="_blank"
						rel="noopener"
						class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					>
						<ExternalLink size={13} />
						Open in New Tab
					</a>
					<button
						class="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						onclick={() => showFrontendPreview = false}
					>
						<X size={16} />
					</button>
				</div>
			</div>

			<!-- iframe -->
			<div class="flex-1 bg-white">
				<iframe
					src={frontendPreviewUrl}
					title="Page Preview"
					class="h-full w-full border-0"
					sandbox="allow-same-origin allow-scripts allow-forms"
				></iframe>
			</div>
		</div>
	</div>
{/if}

{#if showNavigator && pageData}
	<PageNavigator route={route} hasChildren={pageData.has_children} />
{/if}
