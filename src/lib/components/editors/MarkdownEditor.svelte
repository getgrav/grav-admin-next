<script lang="ts">
	import { onMount } from 'svelte';
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
		List, ListOrdered, Quote, Minus, Link, Image, Undo2, Redo2, WrapText
	} from 'lucide-svelte';

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

		return () => {
			observer.disconnect();
			view?.destroy();
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
						class="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
						title="{item.label}{item.shortcut ? ` (${item.shortcut})` : ''}"
						onclick={item.action}
						disabled={disabled || isReadonly}
					>
						<item.icon size={15} strokeWidth={2} />
					</button>
				{/each}
			{/if}
		{/each}
	</div>

	<!-- Editor -->
	<div
		bind:this={editorContainer}
		class="markdown-editor-cm"
		style:min-height={minHeight}
		style:max-height={maxHeight}
	></div>
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
</style>
