<script lang="ts">
	import { onMount, getContext } from 'svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import { EditorView, keymap, placeholder as cmPlaceholder, type ViewUpdate } from '@codemirror/view';
	import { EditorState, type Extension } from '@codemirror/state';
	import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
	import { languages } from '@codemirror/language-data';
	import {
		defaultKeymap, history, historyKeymap,
		indentWithTab, undo, redo
	} from '@codemirror/commands';
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

	interface Props {
		value?: string;
		onchange?: (value: string) => void;
		placeholder?: string;
		minHeight?: string;
		maxHeight?: string;
		class?: string;
		disabled?: boolean;
		readonly?: boolean;
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
	}: Props = $props();

	let showPreview = $state(false);

	// Resolve image paths for preview: page-relative, media://, image://
	const getRoute = getContext<(() => string) | undefined>('pageRoute');

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
		const extensions: Extension[] = [
			// Base
			history(),
			indentOnInput(),
			bracketMatching(),
			closeBrackets(),
			highlightSelectionMatches(),

			// Markdown language with fenced code block support
			markdown({ base: markdownLanguage, codeLanguages: languages }),

			// Syntax highlighting
			markdownHighlighting,

			// Theme
			dark ? shadcnDarkTheme : shadcnLightTheme,
			dark ? oneDark : [],

			// Keymaps
			keymap.of([
				...closeBracketsKeymap,
				...defaultKeymap,
				...searchKeymap,
				...historyKeymap,
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

	function insertImage() {
		if (!view) return;
		const { from, to } = view.state.selection.main;
		const selected = view.state.sliceDoc(from, to);

		if (selected) {
			const insert = `![${selected}](image-url)`;
			view.dispatch({
				changes: { from, to, insert },
				selection: { anchor: from + selected.length + 4, head: from + selected.length + 13 },
			});
		} else {
			const insert = '![alt text](image-url)';
			view.dispatch({
				changes: { from, insert },
				selection: { anchor: from + 2, head: from + 10 },
			});
		}
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

	function doUndo() { if (view) { undo(view); view.focus(); } }
	function doRedo() { if (view) { redo(view); view.focus(); } }

	// Sync external value changes to editor
	$effect(() => {
		if (view && value !== view.state.doc.toString()) {
			view.dispatch({
				changes: { from: 0, to: view.state.doc.length, insert: value ?? '' },
			});
		}
	});

	// React to dark mode changes
	$effect(() => {
		if (view && editorContainer) {
			const currentDoc = view.state.doc.toString();
			view.destroy();
			view = new EditorView({
				state: EditorState.create({
					doc: currentDoc,
					extensions: getExtensions(isDark),
				}),
				parent: editorContainer,
			});
		}
	});

	onMount(() => {
		checkDarkMode();

		// Watch for class changes on <html> to detect theme toggle
		const observer = new MutationObserver(() => checkDarkMode());
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

		createEditor();

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

<div class={cn('overflow-hidden rounded-md border border-input', className)}>
	<!-- Toolbar -->
	<div class="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/50 px-1.5 py-1">
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
	</div>

	<!-- Editor / Preview -->
	{#if showPreview}
		<div
			class="prose prose-sm dark:prose-invert max-w-none overflow-y-auto px-4 py-3"
			style:min-height={minHeight}
			style:max-height={maxHeight || 'none'}
		>
			{#if previewHtml}
				{@html previewHtml}
			{:else}
				<p class="text-muted-foreground italic">Nothing to preview</p>
			{/if}
		</div>
	{:else}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			bind:this={editorContainer}
			class="markdown-editor-cm"
			ondragover={(e) => {
				if (e.dataTransfer?.types.includes('application/x-grav-media') || e.dataTransfer?.types.includes('Files')) {
					e.preventDefault();
					if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
				}
			}}
			ondragenter={(e) => {
				if (e.dataTransfer?.types.includes('application/x-grav-media') || e.dataTransfer?.types.includes('Files')) {
					e.preventDefault();
				}
			}}
			ondrop={(e) => {
				const mdText = e.dataTransfer?.getData('application/x-grav-media')
					? e.dataTransfer?.getData('text/plain')
					: null;
				if (mdText) {
					e.preventDefault();
					const pos = view?.posAtCoords({ x: e.clientX, y: e.clientY }) ?? view?.state.doc.length ?? 0;
					view?.dispatch({ changes: { from: pos, insert: mdText } });
				}
			}}
			style:min-height={minHeight}
			style:max-height={maxHeight}
		></div>
	{/if}
</div>

<style>
	/* Ensure the CodeMirror editor fills its container */
	.markdown-editor-cm :global(.cm-editor) {
		height: 100%;
		background: transparent;
	}
	.markdown-editor-cm :global(.cm-editor.cm-focused) {
		outline: none;
	}
	.markdown-editor-cm :global(.cm-scroller) {
		font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
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
