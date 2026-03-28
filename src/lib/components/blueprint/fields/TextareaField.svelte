<script lang="ts">
	import { onMount } from 'svelte';
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view';
	import { EditorState } from '@codemirror/state';
	import { yaml as yamlLang } from '@codemirror/lang-yaml';
	import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
	import { syntaxHighlighting, defaultHighlightStyle, indentOnInput } from '@codemirror/language';
	import { oneDark } from '@codemirror/theme-one-dark';
	import jsyaml from 'js-yaml';
	import { AlertCircle } from 'lucide-svelte';

	interface Props {
		field: BlueprintField;
		value: unknown;
		onchange: (value: unknown) => void;
	}

	let { field, value, onchange }: Props = $props();
	const translateLabel = i18n.tMaybe;

	const isYaml = !!field.yaml;

	// --- Plain textarea (non-YAML) ---
	const textValue = $derived(String(value ?? field.default ?? ''));

	// --- CodeMirror YAML editor ---
	let editorContainer: HTMLDivElement;
	let view: EditorView | undefined;
	let isDark = $state(false);
	let internalEdit = false;
	let yamlError = $state('');

	function checkDarkMode() {
		isDark = document.documentElement.classList.contains('dark');
	}

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

	function initEditor() {
		if (!isYaml || !editorContainer) return;
		if (view) view.destroy();

		const state = EditorState.create({
			doc: String(value ?? field.default ?? ''),
			extensions: [
				yamlLang(),
				history(),
				indentOnInput(),
				syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
				keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
				isDark ? oneDark : lightTheme,
				isDark ? darkTheme : lightTheme,
				cmPlaceholder(field.placeholder ? translateLabel(field.placeholder) : ''),
				EditorView.updateListener.of((update) => {
					if (update.docChanged) {
						internalEdit = true;
						const text = update.state.doc.toString();
						try {
							jsyaml.load(text);
							yamlError = '';
						} catch (e) {
							yamlError = e instanceof Error ? e.message.split('\n')[0] : 'Invalid YAML';
						}
						onchange(text);
					}
				}),
				EditorView.lineWrapping,
				EditorState.tabSize.of(2),
			],
		});

		view = new EditorView({ state, parent: editorContainer });
	}

	if (isYaml) {
		onMount(() => {
			checkDarkMode();
			initEditor();

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
	}

	// Sync external value changes for CodeMirror
	let lastExternalValue = $state(String(value ?? ''));
	$effect(() => {
		if (!isYaml || !view) return;
		const current = String(value ?? '');
		if (current !== lastExternalValue) {
			lastExternalValue = current;
			if (internalEdit) {
				internalEdit = false;
			} else if (current !== view.state.doc.toString()) {
				view.dispatch({
					changes: { from: 0, to: view.state.doc.length, insert: current }
				});
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
					{#if field.validate?.required}
						<span class="text-red-500">*</span>
					{/if}
				</label>
			{/if}
			{#if field.help}
				<p class="mt-0.5 text-xs text-muted-foreground">{translateLabel(field.help)}</p>
			{/if}
		</div>
	{/if}

	{#if isYaml}
		<div
			bind:this={editorContainer}
			class="overflow-hidden rounded-lg border border-input bg-muted/50 shadow-sm focus-within:ring-1 focus-within:ring-ring
				{yamlError ? 'border-red-500/50' : ''}"
		></div>
		{#if yamlError}
			<div class="flex items-start gap-1.5 text-xs text-red-400">
				<AlertCircle size={12} class="mt-0.5 shrink-0" />
				<span>{yamlError}</span>
			</div>
		{/if}
	{:else}
		<textarea
			class="flex min-h-[80px] w-full rounded-lg border border-input bg-muted/50 px-3 py-2.5 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
			rows={field.rows ?? 4}
			value={textValue}
			placeholder={translateLabel(field.placeholder)}
			disabled={field.disabled}
			readonly={field.readonly}
			oninput={(e) => onchange((e.target as HTMLTextAreaElement).value)}
			style="resize: vertical;"
		></textarea>
	{/if}
</div>
