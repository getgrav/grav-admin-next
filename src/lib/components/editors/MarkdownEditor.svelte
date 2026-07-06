<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { onMount, getContext, untrack } from 'svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import { prefs } from '$lib/stores/preferences.svelte';
	import { EditorView, keymap, placeholder as cmPlaceholder, drawSelection, type ViewUpdate } from '@codemirror/view';
	import { EditorState, type Extension } from '@codemirror/state';
	import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
	import { languages } from '@codemirror/language-data';
	import {
		defaultKeymap, history, historyKeymap,
		indentWithTab, undo, redo
	} from '@codemirror/commands';
	import * as Y from 'yjs';
	import {
		syntaxHighlighting, defaultHighlightStyle,
		indentOnInput, bracketMatching
	} from '@codemirror/language';
	import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
	import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
	import { oneDark } from '@codemirror/theme-one-dark';
	import { cn } from '$lib/utils';
	import { Separator } from '$lib/components/ui/separator';
	import {
		Bold, Italic, Strikethrough, Code, Heading1, Heading2, Heading3,
		List, ListOrdered, Quote, Minus, Link, Image, Undo2, Redo2, WrapText,
		Eye, PenLine
	} from 'lucide-svelte';
	import { marked } from 'marked';
	import { modals } from '$lib/stores/modals.svelte';
	import { getEditorButtons, type EditorToolbarButton } from '$lib/api/endpoints/editorButtons';
	import { ensureKeymapLoaded, keymapExtension } from './keymap';
	import ImageInsertModal from './ImageInsertModal.svelte';
	import type { PageMediaContext } from '$lib/components/media/types';

	import type { Awareness } from 'y-protocols/awareness';
	import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next';

	interface Props {
		value?: string;
		onchange?: (value: string) => void;
		placeholder?: string;
		minHeight?: string;
		maxHeight?: string;
		class?: string;
		disabled?: boolean;
		readonly?: boolean;
		/**
		 * Optional collaborative editing context. When `yText` is set,
		 * the editor binds CodeMirror to that Y.Text via y-codemirror.next's
		 * yCollab plugin — value/onchange become advisory (the Y.Text is
		 * the source of truth) and the external-value reconcile $effect
		 * is suppressed because yCollab handles inbound remote ops.
		 */
		yText?: Y.Text | null;
		yAwareness?: Awareness | null;
		/**
		 * Show plugin-contributed toolbar buttons (e.g. the YouTube insert
		 * button). Defaults on. Set false for compact/auxiliary markdown fields
		 * where plugin buttons would be noise.
		 */
		pluginButtons?: boolean;
	}

	let {
		value = '',
		onchange,
		placeholder = '',
		minHeight = '300px',
		maxHeight = '',
		class: className,
		disabled = false,
		readonly: isReadonly = false,
		yText = null,
		yAwareness = null,
		pluginButtons = true,
	}: Props = $props();

	let showPreview = $state(false);

	// Editor geometry (admin2#37). An explicit `maxHeight` prop always wins;
	// otherwise the user's `editorFixedHeight` preference applies (0 = auto-grow).
	// A fixed height caps the editor and lets CodeMirror's scroller handle
	// overflow internally, which keeps the toolbar in view on its own. Sticky
	// only matters in auto-grow mode, where the toolbar would otherwise scroll
	// off with the page.
	const effectiveMaxHeight = $derived(
		maxHeight || (prefs.editorFixedHeight > 0 ? `${prefs.editorFixedHeight}px` : ''),
	);
	const stickyToolbar = $derived(prefs.editorStickyToolbar && !effectiveMaxHeight);

	// Resolve image paths for preview: page-relative, media://, image://
	const getRoute = getContext<(() => string) | undefined>('pageRoute');

	// Live page media (set by the page editor). Absent in contexts without page
	// media (flex objects, config) — the image picker then shows only URL entry.
	const mediaCtx = getContext<PageMediaContext | undefined>('pageMediaItems');

	function resolveImagePaths(md: string): string {
		const serverUrl = auth.serverUrl || '';
		const pageRoute = getRoute?.() || '';
		// Build the page media base path (e.g. /user/pages/01.home/)
		const cleanRoute = pageRoute.startsWith('/') ? pageRoute.slice(1) : pageRoute;

		return md.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, src) => {
			let resolved = src;

			if (src.startsWith('media://')) {
				// media:// → /user/media/
				resolved = `${serverUrl}/user/media/${src.slice(8)}`;
			} else if (src.startsWith('image://')) {
				// image:// → /user/images/
				resolved = `${serverUrl}/user/images/${src.slice(8)}`;
			} else if (src.startsWith('user://')) {
				// user:// → /user/
				resolved = `${serverUrl}/user/${src.slice(7)}`;
			} else if (src.startsWith('theme://')) {
				// theme:// → skip, can't resolve easily
				resolved = src;
			} else if (!src.startsWith('http') && !src.startsWith('/') && !src.startsWith('data:')) {
				// Relative path → page media, resolve via the frontend page route
				if (pageRoute) {
					resolved = `${serverUrl}${pageRoute}/${src}`;
				}
			}

			return `![${alt}](${resolved})`;
		});
	}

	const previewHtml = $derived(showPreview ? marked.parse(resolveImagePaths(value || ''), { async: false }) as string : '');

	let editorContainer: HTMLDivElement;
	let view: EditorView | undefined;
	let isDark = $state(false);
	// Y.UndoManager attached to the shared Y.Text when collab is active.
	// Held here so toolbar undo/redo can drive it directly. Recreated each
	// time the editor view is rebuilt (e.g. dark-mode toggle).
	let yUndoManager: Y.UndoManager | null = null;

	// Detect dark mode
	function checkDarkMode() {
		isDark = document.documentElement.classList.contains('dark');
	}

	// shadcn-themed CodeMirror theme
	const shadcnLightTheme = EditorView.theme({
		'&': {
			fontSize: '14px',
			fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
			color: 'hsl(240 10% 3.9%)',
		},
		'.cm-content': {
			caretColor: 'hsl(221 83% 53%)',
			padding: '12px 0',
			lineHeight: '1.6',
			color: 'hsl(240 10% 3.9%)',
		},
		'.cm-cursor': {
			borderLeftColor: 'hsl(221 83% 53%)',
			borderLeftWidth: '2px',
		},
		'&.cm-focused .cm-cursor': {
			borderLeftColor: 'hsl(221 83% 53%)',
		},
		'.cm-scroller': {
			overflow: 'auto',
		},
		'.cm-gutters': {
			backgroundColor: 'transparent',
			borderRight: 'none',
			color: 'hsl(240 3.8% 46.1%)',
			paddingRight: '8px',
		},
		'.cm-activeLineGutter': {
			backgroundColor: 'transparent',
			color: 'hsl(240 10% 3.9%)',
		},
		'.cm-activeLine': {
			backgroundColor: 'hsl(240 4.8% 95.9% / 0.5)',
		},
		'.cm-selectionBackground': {
			backgroundColor: 'hsl(221 83% 53% / 0.15) !important',
		},
		'&.cm-focused .cm-selectionBackground': {
			backgroundColor: 'hsl(221 83% 53% / 0.2) !important',
		},
		'.cm-line': {
			padding: '0 16px',
		},
		'.cm-foldPlaceholder': {
			backgroundColor: 'hsl(240 4.8% 95.9%)',
			border: '1px solid hsl(240 5.9% 90%)',
			color: 'hsl(240 3.8% 46.1%)',
			borderRadius: '4px',
			padding: '0 6px',
		},
		'.cm-tooltip': {
			backgroundColor: 'hsl(0 0% 100%)',
			border: '1px solid hsl(240 5.9% 90%)',
			borderRadius: '6px',
			boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
		},
	});

	const shadcnDarkTheme = EditorView.theme({
		'&': {
			fontSize: '14px',
			fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
		},
		'.cm-content': {
			caretColor: 'hsl(217 91% 60%)',
			padding: '12px 0',
			lineHeight: '1.6',
		},
		'.cm-cursor': {
			borderLeftColor: 'hsl(217 91% 60%)',
			borderLeftWidth: '2px',
		},
		'&.cm-focused .cm-cursor': {
			borderLeftColor: 'hsl(217 91% 60%)',
		},
		'.cm-scroller': {
			overflow: 'auto',
		},
		'.cm-gutters': {
			backgroundColor: 'transparent',
			borderRight: 'none',
			color: 'hsl(240 5% 64.9%)',
			paddingRight: '8px',
		},
		'.cm-activeLineGutter': {
			backgroundColor: 'transparent',
			color: 'hsl(0 0% 98%)',
		},
		'.cm-activeLine': {
			backgroundColor: 'hsl(240 3.7% 15.9% / 0.5)',
		},
		'.cm-selectionBackground': {
			backgroundColor: 'hsl(217 91% 60% / 0.2) !important',
		},
		'&.cm-focused .cm-selectionBackground': {
			backgroundColor: 'hsl(217 91% 60% / 0.25) !important',
		},
		'.cm-line': {
			padding: '0 16px',
		},
		'.cm-foldPlaceholder': {
			backgroundColor: 'hsl(240 3.7% 15.9%)',
			border: '1px solid hsl(240 3.7% 15.9%)',
			color: 'hsl(240 5% 64.9%)',
			borderRadius: '4px',
			padding: '0 6px',
		},
		'.cm-tooltip': {
			backgroundColor: 'hsl(240 10% 3.9%)',
			border: '1px solid hsl(240 3.7% 15.9%)',
			borderRadius: '6px',
			boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.3)',
		},
	});

	// Markdown syntax highlighting that matches shadcn aesthetic
	const markdownHighlighting = syntaxHighlighting(defaultHighlightStyle, { fallback: true });

	function getExtensions(dark: boolean): Extension[] {
		// Reset; populated below if collab is active.
		yUndoManager = null;

		// In collab mode the Y.UndoManager (scoped to local origin) replaces
		// CodeMirror's built-in history. Without this swap, Cmd-Z would walk
		// CM's transaction stack and undo remote peers' edits.
		const historyExt: Extension[] = yText ? [] : [history()];
		const undoKeymap = yText ? yUndoManagerKeymap : historyKeymap;

		const extensions: Extension[] = [
			// Optional vim keybindings (admin2#95) — MUST be first so it
			// intercepts keys ahead of the default keymap. Empty unless the
			// user's `editorKeymap` preference is 'vim' and its chunk has loaded.
			keymapExtension(prefs.editorKeymap),
			// Base
			...historyExt,
			drawSelection(),
			indentOnInput(),
			bracketMatching(),
			closeBrackets(),
			highlightSelectionMatches(),

			// Markdown language with fenced code block support
			markdown({ base: markdownLanguage, codeLanguages: languages }),

			// Syntax highlighting
			markdownHighlighting,

			// Theme — oneDark for dark, default highlight for light
			dark ? shadcnDarkTheme : shadcnLightTheme,
			dark ? oneDark : [],

			// Keymaps
			keymap.of([
				...closeBracketsKeymap,
				...defaultKeymap,
				...searchKeymap,
				...undoKeymap,
				indentWithTab,
			]),

			// Update handler
			EditorView.updateListener.of((update: ViewUpdate) => {
				if (update.docChanged) {
					onchange?.(update.state.doc.toString());
				}
			}),

			// Line wrapping
			EditorView.lineWrapping,

			// Editable state
			EditorView.editable.of(!disabled && !isReadonly),
			EditorState.readOnly.of(isReadonly),
		];

		if (placeholder) {
			extensions.push(cmPlaceholder(placeholder));
		}

		// Drop handler: media panel drag-out (text/plain with markdown) or file drops
		extensions.push(
			EditorView.domEventHandlers({
				dragover(event: DragEvent) {
					// Accept drops from media panel and files
					if (event.dataTransfer?.types.includes('application/x-grav-media') ||
						event.dataTransfer?.types.includes('Files')) {
						event.preventDefault();
						event.dataTransfer.dropEffect = 'copy';
						return true;
					}
					return false;
				},
				dragenter(event: DragEvent) {
					if (event.dataTransfer?.types.includes('application/x-grav-media') ||
						event.dataTransfer?.types.includes('Files')) {
						event.preventDefault();
						return true;
					}
					return false;
				},
				drop(event: DragEvent) {
					// Check for media panel drag-out (carries markdown text)
					const mdText = event.dataTransfer?.getData('application/x-grav-media')
						? event.dataTransfer?.getData('text/plain')
						: null;

					if (mdText) {
						event.preventDefault();
						const pos = view?.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view?.state.doc.length ?? 0;
						view?.dispatch({
							changes: { from: pos, insert: mdText },
						});
						return true;
					}

					// Fall back to file drops
					const files = event.dataTransfer?.files;
					if (!files || files.length === 0) return false;

					const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
					if (imageFiles.length === 0) return false;

					event.preventDefault();

					const pos = view?.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view?.state.doc.length ?? 0;
					const insertions = imageFiles.map(f => `![${f.name}](${f.name})`).join('\n');

					view?.dispatch({
						changes: { from: pos, insert: insertions },
					});

					return true;
				},
				paste(event: ClipboardEvent) {
					const files = event.clipboardData?.files;
					if (!files || files.length === 0) return false;

					const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
					if (imageFiles.length === 0) return false;

					event.preventDefault();

					const pos = view?.state.selection.main.head ?? 0;
					const insertions = imageFiles.map(f => `![${f.name || 'image'}](${f.name || 'pasted-image'})`).join('\n');

					view?.dispatch({
						changes: { from: pos, insert: insertions },
					});

					return true;
				},
			})
		);

		// Collaborative editing (Phase 6). When the page editor passes a
		// shared Y.Text, attach y-codemirror.next's yCollab plugin which
		// applies remote ops as ChangeSets on this CM view and writes
		// local edits back to the Y.Text. Awareness powers live cursors.
		// The explicit Y.UndoManager scopes undo to local edits (yCollab's
		// view plugin registers its sync origin as a tracked origin), so
		// Cmd-Z and the toolbar button never roll back peer keystrokes.
		if (yText) {
			yUndoManager = new Y.UndoManager(yText);
			extensions.push(yCollab(yText, yAwareness ?? null, { undoManager: yUndoManager }));
		}

		return extensions;
	}

	function createEditor() {
		if (!editorContainer) return;

		view = new EditorView({
			state: EditorState.create({
				doc: value ?? '',
				extensions: getExtensions(isDark),
			}),
			parent: editorContainer,
		});

		// Expose the EditorView on its root DOM element so external scripts
		// (e.g. ai-translate's admin-next widget) can read/write the content
		// without going through Svelte. Writing via view.dispatch() fires the
		// updateListener which propagates back to onchange.
		(view.dom as unknown as { __cmView?: EditorView }).__cmView = view;
	}

	// Toolbar actions — wrap/insert markdown syntax
	function wrapSelection(before: string, after?: string) {
		if (!view) return;
		const { from, to } = view.state.selection.main;
		const selected = view.state.sliceDoc(from, to);
		const suffix = after ?? before;
		const wrapped = `${before}${selected}${suffix}`;
		view.dispatch({
			changes: { from, to, insert: wrapped },
			selection: { anchor: from + before.length, head: from + before.length + selected.length },
		});
		view.focus();
	}

	function insertAtLineStart(prefix: string) {
		if (!view) return;
		const { from } = view.state.selection.main;
		const line = view.state.doc.lineAt(from);
		const lineText = line.text;

		// If the line already starts with this prefix, remove it (toggle)
		if (lineText.startsWith(prefix)) {
			view.dispatch({
				changes: { from: line.from, to: line.from + prefix.length, insert: '' },
			});
		} else {
			view.dispatch({
				changes: { from: line.from, insert: prefix },
			});
		}
		view.focus();
	}

	function insertHeading(level: number) {
		if (!view) return;
		const { from } = view.state.selection.main;
		const line = view.state.doc.lineAt(from);
		const lineText = line.text;

		// Remove existing heading prefix
		const headingMatch = lineText.match(/^(#{1,6})\s/);
		const prefix = '#'.repeat(level) + ' ';

		if (headingMatch) {
			const oldPrefix = headingMatch[0];
			if (oldPrefix === prefix) {
				// Same level — remove heading
				view.dispatch({
					changes: { from: line.from, to: line.from + oldPrefix.length, insert: '' },
				});
			} else {
				// Different level — replace
				view.dispatch({
					changes: { from: line.from, to: line.from + oldPrefix.length, insert: prefix },
				});
			}
		} else {
			view.dispatch({
				changes: { from: line.from, insert: prefix },
			});
		}
		view.focus();
	}

	function insertLink() {
		if (!view) return;
		const { from, to } = view.state.selection.main;
		const selected = view.state.sliceDoc(from, to);

		if (selected) {
			// Wrap selection as link text
			const insert = `[${selected}](url)`;
			view.dispatch({
				changes: { from, to, insert },
				selection: { anchor: from + selected.length + 3, head: from + selected.length + 6 },
			});
		} else {
			const insert = '[link text](url)';
			view.dispatch({
				changes: { from, insert },
				selection: { anchor: from + 1, head: from + 10 },
			});
		}
		view.focus();
	}

	// Image toolbar button: open a picker (page media thumbnails + manual URL)
	// rather than dropping a `![alt text](image-url)` placeholder. The cursor
	// range is captured now because opening the modal takes focus off CodeMirror.
	let showImageModal = $state(false);
	let imageInsertRange = { from: 0, to: 0 };
	let imageAltSeed = $state('');

	function insertImage() {
		if (!view) return;
		const { from, to } = view.state.selection.main;
		imageInsertRange = { from, to };
		imageAltSeed = view.state.sliceDoc(from, to);
		showImageModal = true;
	}

	function handleImageInsert(markdown: string) {
		showImageModal = false;
		if (!view) return;
		const { from, to } = imageInsertRange;
		view.dispatch({
			changes: { from, to, insert: markdown },
			selection: { anchor: from + markdown.length },
		});
		view.focus();
	}

	function insertHorizontalRule() {
		if (!view) return;
		const { from } = view.state.selection.main;
		const line = view.state.doc.lineAt(from);
		const insert = line.text.length > 0 ? '\n\n---\n\n' : '---\n\n';
		view.dispatch({
			changes: { from: line.to, insert },
		});
		view.focus();
	}

	function doUndo() {
		if (!view) return;
		if (yUndoManager) yUndoManager.undo();
		else undo(view);
		view.focus();
	}
	function doRedo() {
		if (!view) return;
		if (yUndoManager) yUndoManager.redo();
		else redo(view);
		view.focus();
	}

	// Plugin-contributed toolbar buttons (e.g. YouTube). Fetched once and
	// shared across editor instances via the endpoint's session cache.
	let pluginToolbarButtons = $state<EditorToolbarButton[]>([]);

	// Insert text into THIS editor at its current selection. Used for plugin
	// button output so it lands in the editor whose toolbar was clicked —
	// unlike the global `grav:editor:insert-content` event, which every mounted
	// markdown editor would react to.
	function insertAtCursor(text: string) {
		if (!view || !text) return;
		const { from, to } = view.state.selection.main;
		view.dispatch({
			changes: { from, to, insert: text },
			selection: { anchor: from + text.length },
		});
		view.focus();
	}

	async function handlePluginButton(button: EditorToolbarButton) {
		if (!view) return;
		if (button.modal) {
			// The modal builds the markdown and resolves { insertContent } so we
			// can drop it into this specific editor at the cursor.
			const result = (await modals.open({
				kind: 'component',
				plugin: button.plugin,
				component: button.modal.component,
				title: button.modal.title ?? button.label,
				props: button.modal.props,
				size: button.modal.size,
				useStandardHeader: button.modal.useStandardHeader,
			})) as { insertContent?: string } | null;
			if (result && typeof result.insertContent === 'string') {
				insertAtCursor(result.insertContent);
			} else {
				view?.focus();
			}
			return;
		}
		if (button.insert) {
			insertAtCursor(button.insert.content);
		}
	}

	// Sync external value changes to editor — but only when yCollab isn't
	// in charge. With yCollab active, the Y.Text owns the document state
	// and any view.dispatch driven by an external `value` prop would
	// conflict with the CRDT operations the plugin is applying.
	$effect(() => {
		if (yText) return;
		if (view && value !== view.state.doc.toString()) {
			view.dispatch({
				changes: { from: 0, to: view.state.doc.length, insert: value ?? '' },
			});
		}
	});

	// React to dark mode or keymap-preference changes — untrack to avoid
	// re-creating on value/prop changes. Preload the keymap module (a no-op
	// unless 'vim') before rebuilding so vim() is present in the extensions.
	$effect(() => {
		isDark; // track dark mode
		const keymap = prefs.editorKeymap; // track keymap preference
		editorContainer; // track mount
		untrack(() => {
			if (!view || !editorContainer) return;
			void ensureKeymapLoaded(keymap).then(() => {
				if (!view || !editorContainer) return;
				const currentDoc = view.state.doc.toString();
				view.destroy();
				view = new EditorView({
					state: EditorState.create({
						doc: currentDoc,
						extensions: getExtensions(isDark),
					}),
					parent: editorContainer,
				});
				(view.dom as unknown as { __cmView?: EditorView }).__cmView = view;
			});
		});
	});

	onMount(() => {
		checkDarkMode();

		// Watch for class changes on <html> to detect theme toggle
		const observer = new MutationObserver(() => checkDarkMode());
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

		// Preload the keymap module (no-op unless 'vim') so the first paint
		// already carries vim bindings instead of flashing default ones.
		void ensureKeymapLoaded(prefs.editorKeymap).then(() => createEditor());

		// Load plugin-contributed toolbar buttons (cached across instances).
		if (pluginButtons) {
			getEditorButtons()
				.then((btns) => { pluginToolbarButtons = btns; })
				.catch(() => { /* non-critical */ });
		}

		// Listen for content changes from floating widgets (e.g., AI chat)
		function handleEditorInsert(e: CustomEvent) {
			if (!view || !e.detail?.content) return;
			const { content: text, mode } = e.detail;
			if (mode === 'replace') {
				view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
			} else if (mode === 'append') {
				const len = view.state.doc.length;
				view.dispatch({ changes: { from: len, insert: '\n\n' + text } });
			} else if (mode === 'insert-at-cursor') {
				const cursor = view.state.selection.main.head;
				view.dispatch({ changes: { from: cursor, insert: text } });
			}
		}
		window.addEventListener('grav:editor:insert-content', handleEditorInsert as EventListener);

		return () => {
			observer.disconnect();
			view?.destroy();
			window.removeEventListener('grav:editor:insert-content', handleEditorInsert as EventListener);
		};
	});

	type ToolbarAction = {
		icon: typeof Bold;
		label: string;
		action: () => void;
		shortcut?: string;
	};

	const toolbarGroups: (ToolbarAction[] | 'separator')[] = [
		[
			{ icon: Undo2, label: 'Undo', action: doUndo, shortcut: 'Mod+Z' },
			{ icon: Redo2, label: 'Redo', action: doRedo, shortcut: 'Mod+Shift+Z' },
		],
		'separator',
		[
			{ icon: Heading1, label: 'Heading 1', action: () => insertHeading(1) },
			{ icon: Heading2, label: 'Heading 2', action: () => insertHeading(2) },
			{ icon: Heading3, label: 'Heading 3', action: () => insertHeading(3) },
		],
		'separator',
		[
			{ icon: Bold, label: 'Bold', action: () => wrapSelection('**'), shortcut: 'Mod+B' },
			{ icon: Italic, label: 'Italic', action: () => wrapSelection('_'), shortcut: 'Mod+I' },
			{ icon: Strikethrough, label: 'Strikethrough', action: () => wrapSelection('~~') },
			{ icon: Code, label: 'Inline Code', action: () => wrapSelection('`') },
		],
		'separator',
		[
			{ icon: List, label: 'Bullet List', action: () => insertAtLineStart('- ') },
			{ icon: ListOrdered, label: 'Ordered List', action: () => insertAtLineStart('1. ') },
			{ icon: Quote, label: 'Blockquote', action: () => insertAtLineStart('> ') },
		],
		'separator',
		[
			{ icon: Link, label: 'Link', action: insertLink },
			{ icon: Image, label: 'Image', action: insertImage },
			{ icon: Minus, label: 'Horizontal Rule', action: insertHorizontalRule },
		],
		'separator',
		[
			{ icon: Eye, label: 'Toggle Preview', action: () => showPreview = !showPreview },
		],
	];
</script>

<div class={cn('rounded-md border border-input', stickyToolbar ? '' : 'overflow-hidden', className)}>
	<!-- Toolbar — sticky in auto-grow mode so it stays in view while the page
	     scrolls (admin2#37). `--sticky-header-height` is set by the page-edit
	     route; we offset by it so the toolbar pins just under the app header.
	     The wrapper drops `overflow-hidden` while sticky because an
	     overflow:hidden ancestor would otherwise become the sticky scroll
	     container and pin the toolbar to nothing. -->
	<div
		class={cn(
			'flex flex-wrap items-center gap-0.5 border-b border-border px-1.5 py-1',
			stickyToolbar ? 'sticky z-10 rounded-t-md bg-muted' : 'bg-muted/50',
		)}
		style:top={stickyToolbar ? 'var(--sticky-header-height, 0px)' : undefined}
	>
		{#each toolbarGroups as group}
			{#if group === 'separator'}
				<Separator orientation="vertical" class="mx-1 !h-5" />
			{:else}
				{#each group as item}
					<button
						type="button"
						class="inline-flex h-7 w-7 items-center justify-center rounded-sm transition-colors disabled:pointer-events-none disabled:opacity-50
							{item.label === 'Toggle Preview' && showPreview
								? 'bg-primary/10 text-primary'
								: 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
						title="{item.label}{item.shortcut ? ` (${item.shortcut})` : ''}"
						onclick={item.action}
						disabled={item.label === 'Toggle Preview' ? false : disabled || isReadonly}
					>
						{#if item.label === 'Toggle Preview'}
							{#if showPreview}
								<PenLine size={15} strokeWidth={2} />
							{:else}
								<item.icon size={15} strokeWidth={2} />
							{/if}
						{:else}
							<item.icon size={15} strokeWidth={2} />
						{/if}
					</button>
				{/each}
			{/if}
		{/each}

		<!-- Plugin-contributed buttons (e.g. YouTube). Rendered after the
		     built-in groups; each opens a plugin modal or inserts directly. -->
		{#if pluginToolbarButtons.length > 0}
			<Separator orientation="vertical" class="mx-1 !h-5" />
			{#each pluginToolbarButtons as button (button.id)}
				<button
					type="button"
					class="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50 [&_svg]:h-[15px] [&_svg]:w-[15px]"
					title={button.label}
					aria-label={button.label}
					onclick={() => handlePluginButton(button)}
					disabled={disabled || isReadonly}
				>
					{#if button.icon && button.icon.trim().startsWith('<svg')}
						{@html button.icon}
					{:else if button.icon}
						<i class="fa-solid {button.icon.startsWith('fa-') ? button.icon : 'fa-' + button.icon} text-sm"></i>
					{:else}
						<i class="fa-solid fa-circle-dot text-sm"></i>
					{/if}
				</button>
			{/each}
		{/if}
	</div>

	<!-- Editor / Preview -->
	<!-- Both panes stay mounted; visibility toggles via CSS so CodeMirror's
	     view is never orphaned when Preview is toggled off. -->
	<div
		class={cn('prose prose-sm dark:prose-invert max-w-none overflow-y-auto px-4 py-3', stickyToolbar && 'rounded-b-md')}
		style:min-height={minHeight}
		style:max-height={effectiveMaxHeight || 'none'}
		style:display={showPreview ? '' : 'none'}
	>
		{#if showPreview}
			{#if previewHtml}
				{@html previewHtml}
			{:else}
				<p class="text-muted-foreground italic">{i18n.t('ADMIN_NEXT.MARKDOWN_EDITOR.NOTHING_TO_PREVIEW')}</p>
			{/if}
		{/if}
	</div>
	<!-- Drag-and-drop (media-panel drag-out + file drops) is handled by the
	     CodeMirror domEventHandlers extension above. CM mounts inside this
	     container, so drops bubble here too — duplicating them with a second
	     container-level handler inserted the markdown twice (getgrav/grav#4123). -->
	<div
		bind:this={editorContainer}
		class={cn('markdown-editor-cm', stickyToolbar && 'rounded-b-md')}
		dir="ltr"
		style:min-height={effectiveMaxHeight || minHeight}
		style:--cm-max-h={effectiveMaxHeight || 'none'}
		style:display={showPreview ? 'none' : ''}
	></div>
</div>

<ImageInsertModal
	open={showImageModal}
	items={mediaCtx?.items ?? []}
	altSeed={imageAltSeed}
	oninsert={handleImageInsert}
	onclose={() => { showImageModal = false; view?.focus(); }}
/>

<style>
	/* Ensure the CodeMirror editor fills its container. The wrapper is a flex
	   column and the editor flex-grows so it occupies the full `min-height`
	   even when the document is short — without this the .cm-editor collapses
	   to its content height, leaving the empty area below it dead to clicks so
	   only the text itself could focus the editor (admin2#61). CM6 then makes
	   .cm-scroller / .cm-content fill that height, so a click anywhere places
	   the cursor. */
	.markdown-editor-cm {
		display: flex;
		flex-direction: column;
	}
	.markdown-editor-cm :global(.cm-editor) {
		flex: 1 1 auto;
		/* When a fixed height is set (admin2#37), cap the editor here — the
		   CodeMirror-recommended spot — so `.cm-scroller` scrolls internally
		   instead of the whole page growing. `none` = auto-grow. */
		max-height: var(--cm-max-h, none);
		background: transparent;
	}
	.markdown-editor-cm :global(.cm-editor.cm-focused) {
		outline: none;
	}
	.markdown-editor-cm :global(.cm-scroller) {
		font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
	}

	/* Remote-peer cursors and selections (y-codemirror.next).
	   y-codemirror.next applies per-peer colors as inline styles using
	   `awareness.user.color` (set by editorBinding); we only override
	   layout + visibility here. The label shows the user's name from
	   `awareness.user.name`, mirroring editor-pro's labeled-cursor look
	   so a mixed CM + editor-pro session feels consistent. */
	.markdown-editor-cm :global(.cm-ySelectionCaret) {
		position: relative;
		margin-left: -1px;
		margin-right: -1px;
		border-left-width: 2px;
		border-left-style: solid;
		box-sizing: border-box;
	}
	.markdown-editor-cm :global(.cm-ySelectionCaretDot) {
		position: absolute;
		top: -3px;
		left: -4px;
		width: 6px;
		height: 6px;
		border-radius: 50%;
	}
	.markdown-editor-cm :global(.cm-ySelectionInfo) {
		position: absolute;
		top: -1.4em;
		left: -2px;
		font-size: 0.6875rem;
		font-weight: 500;
		font-family: ui-sans-serif, system-ui, sans-serif;
		line-height: 1.2;
		color: #fff;
		padding: 2px 6px;
		border-radius: 4px;
		white-space: nowrap;
		pointer-events: none;
		user-select: none;
		opacity: 1;
		transition: opacity 200ms ease;
	}

	/* Markdown-specific syntax coloring */
	.markdown-editor-cm :global(.cm-header-1) { font-size: 1.4em; font-weight: 700; }
	.markdown-editor-cm :global(.cm-header-2) { font-size: 1.2em; font-weight: 600; }
	.markdown-editor-cm :global(.cm-header-3) { font-size: 1.1em; font-weight: 600; }
	.markdown-editor-cm :global(.cm-strong) { font-weight: 700; }
	.markdown-editor-cm :global(.cm-em) { font-style: italic; }
	.markdown-editor-cm :global(.cm-strikethrough) { text-decoration: line-through; }
	.markdown-editor-cm :global(.cm-url) { color: hsl(221 83% 53%); text-decoration: underline; }
	:global(.dark) .markdown-editor-cm :global(.cm-url) { color: hsl(217 91% 60%); }

	/* Prose styling for markdown preview */
	.prose { line-height: 1.7; color: var(--color-foreground); }
	.prose :global(h1) { font-size: 1.5rem; font-weight: 700; margin: 1.5rem 0 0.5rem; border-bottom: 1px solid var(--color-border); padding-bottom: 0.5rem; }
	.prose :global(h2) { font-size: 1.2rem; font-weight: 600; margin: 1.25rem 0 0.25rem; }
	.prose :global(h3) { font-size: 1.05rem; font-weight: 600; margin: 1rem 0 0.25rem; }
	.prose :global(h4) { font-size: 0.95rem; font-weight: 600; margin: 0.75rem 0 0.25rem; }
	.prose :global(p) { margin: 0.5rem 0; }
	.prose :global(ul) { margin: 0.25rem 0 0.5rem; padding-left: 1.25rem; list-style-type: disc; }
	.prose :global(ol) { margin: 0.25rem 0 0.5rem; padding-left: 1.25rem; list-style-type: decimal; }
	.prose :global(li) { margin: 0.1rem 0; }
	.prose :global(code) { font-size: 0.85em; background: var(--color-muted); padding: 0.15em 0.35em; border-radius: 4px; }
	.prose :global(pre) { background: var(--color-muted); padding: 0.75rem 1rem; border-radius: 8px; overflow-x: auto; margin: 0.5rem 0; }
	.prose :global(pre code) { background: none; padding: 0; }
	.prose :global(a) { color: var(--color-primary); text-decoration: none; }
	.prose :global(a:hover) { text-decoration: underline; }
	.prose :global(blockquote) { border-left: 3px solid var(--color-border); padding-left: 1rem; color: var(--color-muted-foreground); margin: 0.5rem 0; }
	.prose :global(hr) { border: none; border-top: 1px solid var(--color-border); margin: 1rem 0; }
	.prose :global(img) { max-width: 100%; border-radius: 6px; margin: 0.5rem 0; }
	.prose :global(table) { width: 100%; border-collapse: collapse; margin: 0.5rem 0; }
	.prose :global(th), .prose :global(td) { border: 1px solid var(--color-border); padding: 0.4rem 0.75rem; text-align: left; }
	.prose :global(th) { font-weight: 600; background: var(--color-muted); }
</style>
