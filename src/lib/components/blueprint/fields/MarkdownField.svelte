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
	// Defer first mount when this field participates in collab and the
	// room hasn't connected yet — otherwise CodeMirror would mount in
	// solo mode, then need to be torn down and remounted to pick up
	// `yText`, flashing whatever the editor showed in the meantime.
	type CollabPendingCtx = (fieldName: string) => boolean;
	const collabPendingCtx = getContext<CollabPendingCtx | undefined>('collabPending');
	const collabPending = $derived(collabPendingCtx ? collabPendingCtx(field.name) : false);
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
	{#if collabPending}
		<div class="flex h-64 items-center justify-center rounded-lg border border-border bg-card text-sm text-muted-foreground">
			<span class="animate-pulse">{i18n.t('ADMIN_NEXT.PAGES.EDIT.CONNECTING_TO_COLLAB')}</span>
		</div>
	{:else}
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
	{/if}
	{#if field.help}
		<span class="text-xs text-muted-foreground">{@html translateLabel(field.help)}</span>
	{/if}
</div>
