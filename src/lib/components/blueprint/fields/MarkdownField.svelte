<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { i18n } from '$lib/stores/i18n.svelte';
	import MarkdownEditor from '$lib/components/editors/MarkdownEditor.svelte';
	import { getContext } from 'svelte';
	import type * as Y from 'yjs';
	import type { Awareness } from 'y-protocols/awareness';

	interface Props {
		field: BlueprintField;
		value: unknown;
		onchange: (value: unknown) => void;
	}

	let { field, value, onchange }: Props = $props();
	const translateLabel = i18n.tMaybe;

	/**
	 * Optional collaborative-editing context. The page editor wires this
	 * up so CodeMirror binds to a shared Y.Text (live CRDT merges +
	 * cursors) when collab is active for the current page. Returns null
	 * for fields that aren't participating.
	 */
	interface EditorCollab {
		fragment?: unknown;
		yText: Y.Text;
		awareness: Awareness;
		user: { name: string; color: string };
	}
	type CollabCtx = (fieldName: string) => EditorCollab | null;
	const collabCtx = getContext<CollabCtx | undefined>('editorCollab');
	const collab = $derived(collabCtx ? collabCtx(field.name) : null);
</script>

<div class="space-y-2">
	{#if field.label}
		<span class="text-sm font-medium text-foreground">
			{translateLabel(field.label)}
			{#if field.validate?.required}
				<span class="text-red-500">*</span>
			{/if}
		</span>
	{/if}
	<MarkdownEditor
		value={typeof value === 'string' ? value : (value != null ? String(value) : (typeof field.default === 'string' ? field.default : ''))}
		onchange={(v) => onchange(v)}
		placeholder={translateLabel(field.placeholder) ?? ''}
		minHeight={field.rows ? `${field.rows * 24}px` : '300px'}
		disabled={field.disabled}
		readonly={field.readonly}
		yText={collab?.yText ?? null}
		yAwareness={collab?.awareness ?? null}
		yUser={collab?.user ?? null}
	/>
	{#if field.help}
		<span class="text-xs text-muted-foreground">{translateLabel(field.help)}</span>
	{/if}
</div>
