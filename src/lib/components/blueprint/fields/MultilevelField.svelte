<script lang="ts">
	import { onMount } from 'svelte';
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { i18n } from '$lib/stores/i18n.svelte';
	import jsyaml from 'js-yaml';
	import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view';
	import { EditorState } from '@codemirror/state';
	import { yaml } from '@codemirror/lang-yaml';
	import {
		defaultKeymap, history, historyKeymap, indentWithTab
	} from '@codemirror/commands';
	import {
		syntaxHighlighting, defaultHighlightStyle,
		indentOnInput
	} from '@codemirror/language';
	import { oneDark } from '@codemirror/theme-one-dark';
	import { AlertCircle } from 'lucide-svelte';

	interface Props {
		field: BlueprintField;
		value: unknown;
		onchange: (value: unknown) => void;
	}

	let { field, value, onchange }: Props = $props();
	const translateLabel = i18n.tMaybe;

	let editorContainer: HTMLDivElement;
	let view: EditorView | undefined;
	let isDark = $state(false);
	let parseError = $state('');

	function checkDarkMode() {
		isDark = document.documentElement.classList.contains('dark');
	}

	// Compact theme that fits inside a form field
	const lightTheme = EditorView.theme({
		'&': { fontSize: '13px', fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace' },
		'.cm-content': { caretColor: 'hsl(221 83% 53%)', padding: '8px 0', lineHeight: '1.5' },
		'.cm-cursor': { borderLeftColor: 'hsl(221 83% 53%)', borderLeftWidth: '2px' },
		'.cm-scroller': { overflow: 'auto' },
		'.cm-gutters': { backgroundColor: 'transparent', borderRight: 'none', color: 'hsl(240 3.8% 46.1%)', paddingRight: '4px' },
		'.cm-activeLine': { backgroundColor: 'hsl(240 4.8% 95.9% / 0.5)' },
		'.cm-selectionBackground': { backgroundColor: 'hsl(221 83% 53% / 0.15) !important' },
		'.cm-line': { padding: '0 12px' },
	});

	const darkTheme = EditorView.theme({
		'&': { fontSize: '13px', fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace' },
		'.cm-content': { caretColor: 'hsl(217 91% 60%)', padding: '8px 0', lineHeight: '1.5' },
		'.cm-cursor': { borderLeftColor: 'hsl(217 91% 60%)', borderLeftWidth: '2px' },
		'.cm-scroller': { overflow: 'auto' },
		'.cm-gutters': { backgroundColor: 'transparent', borderRight: 'none', color: 'hsl(240 5% 64.9%)', paddingRight: '4px' },
		'.cm-activeLine': { backgroundColor: 'hsl(240 3.7% 15.9% / 0.5)' },
		'.cm-selectionBackground': { backgroundColor: 'hsl(217 91% 60% / 0.2) !important' },
		'.cm-line': { padding: '0 12px' },
	});

	function toYaml(obj: unknown): string {
		if (obj === null || obj === undefined || (typeof obj === 'object' && Object.keys(obj as object).length === 0)) return '';
		return jsyaml.dump(obj, { indent: 2, lineWidth: -1, noRefs: true }).trimEnd();
	}

	function parseYaml(text: string): unknown {
		if (!text.trim()) return {};
		return jsyaml.load(text) ?? {};
	}

	function createExtensions() {
		return [
			yaml(),
			history(),
			indentOnInput(),
			syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
			keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
			isDark ? oneDark : lightTheme,
			isDark ? darkTheme : lightTheme,
			cmPlaceholder(field.placeholder_key ? `${translateLabel(field.placeholder_key)}: ${translateLabel(field.placeholder_value)}` : 'key: value'),
			EditorView.updateListener.of((update) => {
				if (update.docChanged) {
					internalEdit = true;
					const text = update.state.doc.toString();
					try {
						const parsed = parseYaml(text);
						parseError = '';
						onchange(parsed);
					} catch {
						parseError = 'Invalid YAML';
					}
				}
			}),
			EditorView.lineWrapping,
			EditorState.tabSize.of(2),
		];
	}

	function initEditor() {
		if (view) view.destroy();

		const state = EditorState.create({
			doc: toYaml(value),
			extensions: createExtensions(),
		});

		view = new EditorView({ state, parent: editorContainer });
	}

	onMount(() => {
		checkDarkMode();
		initEditor();

		// Watch for dark mode changes
		const observer = new MutationObserver(() => {
			const wasDark = isDark;
			checkDarkMode();
			if (wasDark !== isDark) initEditor();
		});
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

		return () => {
			observer.disconnect();
			view?.destroy();
		};
	});

	// Flag to prevent round-trip: editor change -> onchange -> $effect -> inject back
	let internalEdit = false;

	// Only sync external value changes (e.g., initial load, reload from API)
	let lastExternalJson = $state(JSON.stringify(value));
	$effect(() => {
		const current = JSON.stringify(value);
		if (current !== lastExternalJson && view) {
			lastExternalJson = current;
			if (internalEdit) {
				// Change originated from the editor — don't re-inject
				internalEdit = false;
			} else {
				// External change — update editor content
				const newText = toYaml(value);
				if (newText !== view.state.doc.toString()) {
					view.dispatch({
						changes: { from: 0, to: view.state.doc.length, insert: newText }
					});
				}
			}
		}
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
				<p class="mt-0.5 text-xs text-muted-foreground">{translateLabel(field.help)}</p>
			{/if}
		</div>
	{/if}

	<div
		bind:this={editorContainer}
		class="overflow-hidden rounded-lg border border-input bg-muted/50 shadow-sm focus-within:ring-1 focus-within:ring-ring
			{parseError ? 'border-red-500/50' : ''}"
	></div>

	{#if parseError}
		<div class="flex items-center gap-1.5 text-xs text-red-400">
			<AlertCircle size={12} />
			{parseError}
		</div>
	{/if}
</div>
