<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import {
		EditorView,
		keymap,
		highlightSpecialChars,
		lineNumbers,
		highlightActiveLineGutter,
		highlightActiveLine,
	} from '@codemirror/view';
	import type { Extension } from '@codemirror/state';
	import { EditorState } from '@codemirror/state';
	import {
		defaultHighlightStyle,
		syntaxHighlighting,
		indentOnInput,
		bracketMatching,
		foldGutter,
		foldKeymap,
	} from '@codemirror/language';
	import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
	import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
	import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
	import { yaml } from '@codemirror/lang-yaml';
	import { oneDark } from '@codemirror/theme-one-dark';

	interface Props {
		value?: string;
		onchange?: (value: string) => void;
		language?: 'yaml' | 'text';
		placeholder?: string;
		minHeight?: string;
		maxHeight?: string;
		disabled?: boolean;
		readonly?: boolean;
		class?: string;
	}

	let {
		value = '',
		onchange,
		language = 'yaml',
		placeholder = '',
		minHeight = '120px',
		maxHeight = '400px',
		disabled = false,
		readonly: isReadonly = false,
		class: className = '',
	}: Props = $props();

	let containerEl = $state<HTMLDivElement | null>(null);
	let view: EditorView | undefined;
	let isDark = $state(false);

	function checkDarkMode() {
		isDark = document.documentElement.classList.contains('dark');
	}

	const shadcnLightTheme = EditorView.theme({
		'&': {
			fontSize: '13px',
			fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
			color: 'hsl(240 10% 3.9%)',
		},
		'.cm-content': {
			caretColor: 'hsl(221 83% 53%)',
			padding: '8px 0',
			lineHeight: '1.5',
		},
		'.cm-cursor': { borderLeftColor: 'hsl(221 83% 53%)', borderLeftWidth: '2px' },
		'.cm-scroller': { overflow: 'auto' },
		'.cm-gutters': {
			backgroundColor: 'transparent',
			borderRight: 'none',
			color: 'hsl(240 3.8% 46.1%)',
			paddingRight: '8px',
		},
		'.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'hsl(240 10% 3.9%)' },
		'.cm-activeLine': { backgroundColor: 'hsl(240 4.8% 95.9% / 0.5)' },
		'.cm-selectionBackground': { backgroundColor: 'hsl(221 83% 53% / 0.15) !important' },
		'.cm-line': { padding: '0 12px' },
		'.cm-foldPlaceholder': {
			backgroundColor: 'hsl(240 4.8% 95.9%)',
			border: '1px solid hsl(240 5.9% 90%)',
			borderRadius: '4px',
			padding: '0 6px',
		},
	});

	const shadcnDarkTheme = EditorView.theme({
		'&': {
			fontSize: '13px',
			fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
		},
		'.cm-content': { caretColor: 'hsl(217 91% 60%)', padding: '8px 0', lineHeight: '1.5' },
		'.cm-cursor': { borderLeftColor: 'hsl(217 91% 60%)', borderLeftWidth: '2px' },
		'.cm-scroller': { overflow: 'auto' },
		'.cm-gutters': {
			backgroundColor: 'transparent',
			borderRight: 'none',
			color: 'hsl(240 5% 64.9%)',
			paddingRight: '8px',
		},
		'.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'hsl(0 0% 98%)' },
		'.cm-activeLine': { backgroundColor: 'hsl(240 3.7% 15.9% / 0.5)' },
		'.cm-selectionBackground': { backgroundColor: 'hsl(217 91% 60% / 0.2) !important' },
		'.cm-line': { padding: '0 12px' },
		'.cm-foldPlaceholder': {
			backgroundColor: 'hsl(240 3.7% 15.9%)',
			border: '1px solid hsl(240 3.7% 15.9%)',
			borderRadius: '4px',
			padding: '0 6px',
		},
	});

	function getExtensions(dark: boolean): Extension[] {
		const extensions: Extension[] = [
			history(),
			indentOnInput(),
			bracketMatching(),
			closeBrackets(),
			highlightSelectionMatches(),
			highlightSpecialChars(),
			lineNumbers(),
			highlightActiveLineGutter(),
			highlightActiveLine(),
			foldGutter(),
			syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
			keymap.of([
				...closeBracketsKeymap,
				...defaultKeymap,
				...searchKeymap,
				...historyKeymap,
				...foldKeymap,
				indentWithTab,
			]),
			EditorView.lineWrapping,
			EditorView.editable.of(!disabled && !isReadonly),
			EditorState.readOnly.of(!!isReadonly),
			EditorView.updateListener.of((update) => {
				if (update.docChanged) {
					onchange?.(update.state.doc.toString());
				}
			}),
		];

		if (placeholder) {
			extensions.push(EditorView.contentAttributes.of({ 'aria-placeholder': placeholder }));
		}

		// Language
		if (language === 'yaml') {
			extensions.push(yaml());
		}

		// Theme — oneDark for dark, default highlight for light
		if (dark) {
			extensions.push(shadcnDarkTheme, oneDark);
		} else {
			extensions.push(shadcnLightTheme);
		}

		return extensions;
	}

	function createEditor() {
		if (!containerEl) return;
		view?.destroy();
		view = new EditorView({
			state: EditorState.create({
				doc: value ?? '',
				extensions: getExtensions(isDark),
			}),
			parent: containerEl,
		});
	}

	// Sync external value changes into editor
	$effect(() => {
		if (view && value !== view.state.doc.toString()) {
			view.dispatch({
				changes: { from: 0, to: view.state.doc.length, insert: value ?? '' },
			});
		}
	});

	// Recreate on dark mode change only — untrack to avoid re-creating on value changes
	$effect(() => {
		isDark; // track dark mode
		if (containerEl) untrack(() => createEditor());
	});

	onMount(() => {
		checkDarkMode();
		const observer = new MutationObserver(() => checkDarkMode());
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
		createEditor();
		return () => {
			observer.disconnect();
			view?.destroy();
		};
	});
</script>

<div
	bind:this={containerEl}
	class="overflow-hidden rounded-lg border border-input bg-muted/50 shadow-sm focus-within:ring-1 focus-within:ring-ring {className}"
	style="min-height: {minHeight}; max-height: {maxHeight}; overflow-y: auto;"
></div>
