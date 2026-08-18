<script module lang="ts">
	// Which markdown editor should consume a globally-broadcast insert
	// (`grav:editor:insert-content`, dispatched by e.g. the Page Media panel's
	// insert button). Without routing, EVERY mounted editor reacts to that window
	// event, so on a page with more than one markdown field (the main content plus
	// a `description` field, say) the same image is inserted into all of them.
	//
	// The target is resolved dynamically in this priority order:
	//   1. the last-focused editor (what the user was just typing in),
	//   2. the editor marked `primary` (the page's main content editor),
	//   3. the first still-mounted editor as a last resort.
	// Each candidate is checked against `liveEditorIds`, so an id left over from
	// an unmounted editor is simply skipped — no manual handoff needed.
	let activeEditorId = 0;
	let primaryEditorId = 0;
	let editorIdCounter = 0;
	const liveEditorIds = new Set<number>();

	function resolveInsertTargetId(): number {
		if (activeEditorId && liveEditorIds.has(activeEditorId)) return activeEditorId;
		if (primaryEditorId && liveEditorIds.has(primaryEditorId)) return primaryEditorId;
		return liveEditorIds.values().next().value ?? 0;
	}
</script>

<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { onMount, getContext, untrack } from 'svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import { prefs } from '$lib/stores/preferences.svelte';
	import { EditorView, keymap, placeholder as cmPlaceholder, drawSelection, type KeyBinding, type ViewUpdate } from '@codemirror/view';
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
		indentOnInput, bracketMatching, syntaxTree
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
	import { renderMarkdown } from '$lib/utils/markdown';
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
		/**
		 * Marks this as the page's main content editor. When nothing is focused,
		 * a globally-broadcast insert (Page Media, AI chat, …) is routed here
		 * rather than to whichever markdown field happened to mount first. Only
		 * the main content editor should set this; auxiliary fields leave it off.
		 */
		primary?: boolean;
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
		primary = false,
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

	const previewHtml = $derived(showPreview ? renderMarkdown(resolveImagePaths(value || '')) : '');

	let editorContainer: HTMLDivElement;
	let view: EditorView | undefined;
	let isDark = $state(false);

	// Unique id so the shared active-editor tracking (see module script) can route
	// a globally-broadcast insert to just this editor when it is the focused one.
	const editorId = ++editorIdCounter;
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

			// Toolbar shortcuts (admin2#163). Placed BEFORE the base keymap so
			// `Mod-i` reaches Italic instead of defaultKeymap's `selectParentSyntax`
			// — the same array-order precedence the vim keymap above relies on.
			// The bindings are derived from the `shortcut` strings the tooltips
			// already display, so a tooltip can never advertise a key that isn't
			// actually bound.
			keymap.of(toolbarKeymap()),

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
				// Remember the last-focused editor so a globally-broadcast insert
				// (Page Media, etc.) lands only here and not in every markdown field.
				if (update.focusChanged && update.view.hasFocus) {
					activeEditorId = editorId;
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

	// Which Lezer inline node each wrap marker produces. The editor is configured
	// with `markdownLanguage` (CommonMark + GFM), so Strikethrough is parsed too.
	// Used to spot an existing mark around the selection so a second click removes
	// it instead of nesting another pair (admin2#161).
	const inlineNodes: Record<string, { node: string; mark: string }> = {
		'**': { node: 'StrongEmphasis', mark: 'EmphasisMark' },
		'_': { node: 'Emphasis', mark: 'EmphasisMark' },
		'~~': { node: 'Strikethrough', mark: 'StrikethroughMark' },
		'`': { node: 'InlineCode', mark: 'CodeMark' },
	};

	// Nearest ancestor of the given node type that fully contains [from, to).
	function enclosingInlineNode(name: string, from: number, to: number) {
		if (!view) return null;
		let node = syntaxTree(view.state).resolveInner(from, 1);
		for (;;) {
			if (node.name === name && node.from <= from && node.to >= to) return node;
			const parent = node.parent;
			if (!parent) return null;
			node = parent;
		}
	}

	// Toolbar actions — toggle the inline markdown syntax around the selection.
	function wrapSelection(before: string, after?: string) {
		if (!view) return;
		const { state } = view;
		const { from, to } = state.selection.main;
		const selected = state.sliceDoc(from, to);
		const suffix = after ?? before;

		// 1. The markers are inside the selection ("**hello**" selected) — strip them.
		if (
			selected.length >= before.length + suffix.length &&
			selected.startsWith(before) && selected.endsWith(suffix)
		) {
			const inner = selected.slice(before.length, selected.length - suffix.length);
			view.dispatch({
				changes: { from, to, insert: inner },
				selection: { anchor: from, head: from + inner.length },
			});
			view.focus();
			return;
		}

		// 2. The selection sits inside an existing mark — drop that mark's delimiters.
		//    The syntax tree is consulted rather than just the characters either side
		//    so nesting unwraps the right layer: on `***hi***` Italic removes one `*`
		//    per side and leaves the bold alone, and `*hi*` is recognised by the
		//    Italic button even though the button itself writes `_`.
		const target = inlineNodes[before];
		if (target) {
			const node = enclosingInlineNode(target.node, from, to);
			const marks = node?.getChildren(target.mark) ?? [];
			if (marks.length === 2) {
				const markLength = marks[0].to - marks[0].from;
				view.dispatch({
					changes: [
						{ from: marks[0].from, to: marks[0].to, insert: '' },
						{ from: marks[1].from, to: marks[1].to, insert: '' },
					],
					selection: { anchor: marks[0].from, head: marks[1].from - markLength },
				});
				view.focus();
				return;
			}
		}

		// 3. Fall back to the characters either side of the selection. Covers a spot
		//    the incremental parser hasn't reached yet, and markers that were typed
		//    by hand and not re-parsed.
		if (
			from >= before.length &&
			state.sliceDoc(from - before.length, from) === before &&
			state.sliceDoc(to, to + suffix.length) === suffix
		) {
			view.dispatch({
				changes: [
					{ from: from - before.length, to: from, insert: '' },
					{ from: to, to: to + suffix.length, insert: '' },
				],
				selection: {
					anchor: from - before.length,
					head: from - before.length + selected.length,
				},
			});
			view.focus();
			return;
		}

		// 4. Nothing to remove — wrap.
		view.dispatch({
			changes: { from, to, insert: `${before}${selected}${suffix}` },
			selection: { anchor: from + before.length, head: from + before.length + selected.length },
		});
		view.focus();
	}

	// Line-prefix actions (lists, blockquote). Applies to EVERY line the selection
	// touches, so marking up a block of existing text takes one click (admin2#162).
	// Headings deliberately stay single-line — they have their own insertHeading()
	// below and are untouched by this.
	//
	// `prefix` is a function for ordered lists so the numbering runs 1. 2. 3.
	// rather than repeating `1.`; `pattern` matches whatever already counts as
	// this prefix, so `* item` and `3. item` are recognised as well as what we
	// write ourselves.
	function insertAtLineStart(prefix: string | ((index: number) => string), pattern?: RegExp) {
		if (!view) return;
		const { doc } = view.state;
		const { from, to } = view.state.selection.main;
		const firstLine = doc.lineAt(from);
		let lastLine = doc.lineAt(to);

		// A selection dragged to the start of the following line (what triple-click
		// and shift-down give you) shouldn't mark up that empty trailing line.
		if (lastLine.number > firstLine.number && to === lastLine.from) {
			lastLine = doc.line(lastLine.number - 1);
		}

		const lines = Array.from(
			{ length: lastLine.number - firstLine.number + 1 },
			(_, i) => doc.line(firstLine.number + i),
		);

		const existingLength = (text: string) => {
			if (pattern) return text.match(pattern)?.[0].length ?? 0;
			return text.startsWith(prefix as string) ? (prefix as string).length : 0;
		};

		// Toggle off only when EVERY line already carries the prefix, so a partly
		// marked-up selection completes rather than clears.
		const allPrefixed = lines.every((line) => existingLength(line.text) > 0);

		view.dispatch({
			changes: lines.map((line, index) => ({
				from: line.from,
				to: line.from + existingLength(line.text),
				insert: allPrefixed ? '' : typeof prefix === 'function' ? prefix(index) : prefix,
			})),
		});
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

		// Register for active-editor routing (see module script). A `primary`
		// editor claims the default insert target so a media insert with nothing
		// focused lands in the main content editor regardless of mount order.
		liveEditorIds.add(editorId);
		if (primary) primaryEditorId = editorId;

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
			// This event is broadcast to every mounted editor; only the resolved
			// target (focused → primary → first-live) should consume it, otherwise
			// the same content is inserted into every markdown field on the page
			// (e.g. content + description).
			if (resolveInsertTargetId() !== editorId) return;
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
			liveEditorIds.delete(editorId);
			// No manual handoff needed: resolveInsertTargetId() checks liveEditorIds
			// membership, so a stale focused/primary id just falls through to the
			// next candidate. Clear our slots so they can't linger.
			if (activeEditorId === editorId) activeEditorId = 0;
			if (primaryEditorId === editorId) primaryEditorId = 0;
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
			{ icon: List, label: 'Bullet List', action: () => insertAtLineStart('- ', /^[-*+]\s/) },
			{ icon: ListOrdered, label: 'Ordered List', action: () => insertAtLineStart((n) => `${n + 1}. `, /^\d+\.\s/) },
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

	// A toolbar `shortcut` label in CodeMirror key syntax: 'Mod+Shift+Z' becomes
	// 'Mod-Shift-z'. Single-character keys are lower-cased to match how CodeMirror
	// (and defaultKeymap) name them.
	function toCodeMirrorKey(shortcut: string): string {
		const parts = shortcut.split('+');
		const key = parts.pop() ?? '';
		return [...parts, key.length === 1 ? key.toLowerCase() : key].join('-');
	}

	// Keybindings for every toolbar button that advertises a shortcut (admin2#163).
	// Derived from the toolbar definition itself so the tooltip and the binding
	// cannot drift apart — adding `shortcut:` to a button is all it takes.
	function toolbarKeymap(): KeyBinding[] {
		return toolbarGroups
			.flatMap((group) => (group === 'separator' ? [] : group))
			.filter((item) => !!item.shortcut)
			.map((item) => ({
				key: toCodeMirrorKey(item.shortcut as string),
				preventDefault: true,
				run: () => {
					if (disabled || isReadonly) return false;
					item.action();
					return true;
				},
			}));
	}
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
		border-left-width: 1px;
		border-left-style: solid;
		box-sizing: border-box;
	}
	.markdown-editor-cm :global(.cm-ySelectionCaretDot) {
		display: none;
	}
	.markdown-editor-cm :global(.cm-ySelectionInfo) {
		position: absolute;
		top: -1.7em;
		left: -1px;
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

  .markdown-editor-cm :global(.cm-yLineSelection) {
		margin: 0;
	}

  .markdown-editor-cm :global(.cm-widgetBuffer) {
      display: none;
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
