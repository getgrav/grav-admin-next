<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { marked } from 'marked';
	import TabsField from './fields/TabsField.svelte';
	import SectionField from './fields/SectionField.svelte';
	import SpacerField from './fields/SpacerField.svelte';
	import TextField from './fields/TextField.svelte';
	import PasswordBlueprintField from './fields/PasswordField.svelte';
	import TextareaField from './fields/TextareaField.svelte';
	import MarkdownField from './fields/MarkdownField.svelte';
	import SelectField from './fields/SelectField.svelte';
	import ToggleField from './fields/ToggleField.svelte';
	import RawField from './fields/RawField.svelte';
	import PagesField from './fields/PagesField.svelte';
	import ThemeSelectField from './fields/ThemeSelectField.svelte';
	import ArrayField from './fields/ArrayField.svelte';
	import DateFormatField from './fields/DateFormatField.svelte';
	import SelectizeField from './fields/SelectizeField.svelte';
	import ListField from './fields/ListField.svelte';
	import CronField from './fields/CronField.svelte';
	import MultilevelField from './fields/MultilevelField.svelte';
	import PageMediaField from './fields/PageMediaField.svelte';
	import DateTimeField from './fields/DateTimeField.svelte';
	import TaxonomyField from './fields/TaxonomyField.svelte';
	import FolderSlugField from './fields/FolderSlugField.svelte';
	import FilePickerField from './fields/FilePickerField.svelte';
	import FileField from './fields/FileField.svelte';
	import ElementsField from './fields/ElementsField.svelte';
	import ConditionalField from './fields/ConditionalField.svelte';
	import FrontmatterField from './fields/FrontmatterField.svelte';
	import IconPickerField from './fields/IconPickerField.svelte';
	import PermissionsField from './fields/PermissionsField.svelte';
	import CronStatusField from './fields/CronStatusField.svelte';
	import WebhookStatusField from './fields/WebhookStatusField.svelte';
	import WebhookExamplesField from './fields/WebhookExamplesField.svelte';
	import CustomFieldWrapper from './fields/CustomFieldWrapper.svelte';
	import PageExistsField from './fields/PageExistsField.svelte';
	import { customFieldRegistry } from '$lib/stores/customFields.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { fieldMatches } from '$lib/utils/field-filter';
	import { auth } from '$lib/stores/auth.svelte';
	import { getContext } from 'svelte';
	import EditorLockNotice from '$lib/components/sync/EditorLockNotice.svelte';

	// Page editor publishes this when the current room's first joiner
	// is using a different content editor than us — see +page.svelte for
	// why we can't safely cross-sync mixed editor types.
	type EditorLockState = { ownerType: string; ownerName: string } | null;
	const editorLockCtx = getContext<(() => EditorLockState) | undefined>('editorLock');
	const contentLock = $derived.by((): EditorLockState => editorLockCtx?.() ?? null);

	// Resolve the user's preferred content editor if it's a registered custom field
	const preferredEditor = $derived.by(() => {
		const pref = auth.contentEditor || '';
		return (pref && pref !== 'default' && customFieldRegistry.has(pref)) ? pref : '';
	});

	interface Props {
		field: BlueprintField;
		value: unknown;
		onchange: (value: unknown) => void;
		oncommit?: (value: unknown, oldValue?: unknown) => void;
		getValue: (path: string) => unknown;
		onFieldChange: (path: string, value: unknown) => void;
		onFieldCommit?: (path: string, value: unknown, oldValue?: unknown) => void;
		filter?: string;
		/** When true, label/help are rendered externally (e.g. by SectionField) — skip internal label */
		externalLabel?: boolean;
	}

	let { field, value, onchange, oncommit, getValue, onFieldChange, onFieldCommit, filter = '', externalLabel = false }: Props = $props();

	// --- Auto-save commit categorization ---
	// Blur-commit: fields where user types text — commit on focusout
	const blurCommitTypes = new Set([
		'text', 'email', 'url', 'tel', 'password', 'number',
		'date', 'time', 'month', 'week', 'color',
		'textarea', 'raw', 'folder-slug', 'frontmatter', 'codemirror',
		'markdown', 'editor', 'colorpicker', 'range',
	]);
	// Immediate-commit: fields where a single action completes the edit
	const immediateCommitTypes = new Set([
		'toggle', 'switch', 'select', 'selectize', 'checkbox', 'checkboxes',
		'radio', 'datetime', 'dateformat',
		'filepicker', 'mediapicker', 'pagemediaselect', 'file',
		'pages', 'parents', 'taxonomy', 'cron', 'multilevel',
		'iconpicker', 'permissions', 'acl_picker', 'themeselect',
	]);

	const isBlurCommit = $derived(blurCommitTypes.has(field.type));
	const isImmediateCommit = $derived(immediateCommitTypes.has(field.type));

	// For immediate-commit fields, fire oncommit BEFORE onchange
	// so auto-save can capture the old value via getValue before data mutates
	const committingOnchange = $derived(
		isImmediateCommit && oncommit
			? (val: unknown) => { oncommit(val); onchange(val); }
			: onchange
	);

	// For blur-commit fields, capture the value when focus enters (before typing)
	// so we can pass the correct old value to oncommit on focusout
	let blurOldValue = $state<unknown>(undefined);
	let hasBlurBaseline = $state(false);

	// Use i18n.tMaybe for all label translation
	const translateLabel = i18n.tMaybe;

	// Container types that manage their own layout
	const containerTypes = new Set(['section', 'fieldset', 'tabs', 'tab', 'columns', 'column', 'pagemedia', 'cronstatus', 'webhook-status', 'page-exists']);

	// Should this field use the 2-column (label left, field right) layout?
	// Only for non-container leaf fields that have a label and aren't explicitly vertical
	const useTwoColumn = $derived(
		!externalLabel &&
		!containerTypes.has(field.type) &&
		field.type !== 'spacer' &&
		field.type !== 'display' &&
		field.style !== 'vertical' &&
		!!(field.label || field.help)
	);

	// Fields suppressed in admin-next (handled by the UI directly)
	// - order fields: reordering is via drag-and-drop in listing views
	// - enabled: plugin enable/disable is in the toolbar, not the form
	const suppressedNames = new Set([
		'order_title', 'header.order_by', 'header.order_manual', 'enabled',
		'health_status', 'active_triggers',
	]);
	// Sections whose title should be hidden (content still renders)
	const hideTitleSections = new Set(['status_title']);
	const suppressedTypes = new Set(['order', 'blueprint', 'hidden']);
	// Fields to relocate from later columns into the first column (e.g. ordering toggle → settings)
	const relocateToFirstColumn = new Set(['ordering']);

	// Check if this display field has content that should be suppressed (raw HTML/JS from old admin)
	const isRawDisplayField = $derived(
		field.type === 'display' && (() => {
			const c = field.content || field.text || field.description || '';
			return c === '' || c.includes('<script') || c.includes('<div id=');
		})()
	);

	// Map field types to components
	const inputTypes = new Set([
		'text', 'email', 'url', 'tel', 'password', 'number',
		'date', 'time', 'month', 'week', 'color',
	]);

</script>

{#if suppressedNames.has(field.name) || suppressedTypes.has(field.type)}
	<!-- Suppressed in admin-next -->

{:else if field.name === 'webhook_examples'}
	<WebhookExamplesField {field} {value} {onchange} />

{:else if isRawDisplayField}
	<!-- Suppress display fields containing raw JS/HTML or with empty content -->

{:else if filter && !fieldMatches(field, filter)}
	<!-- Filtered out -->

{:else if useTwoColumn}
	<!-- 2-column layout: label left, field right -->
	<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_2fr] lg:items-start lg:gap-x-6">
		<div class="lg:pt-2.5">
			{#if field.label}
				<span class="text-sm font-semibold text-foreground">{translateLabel(field.label)}</span>
			{/if}
			{#if field.help}
				<p class="mt-0.5 text-xs text-muted-foreground">{translateLabel(field.help)}</p>
			{/if}
		</div>
		<div>
			<svelte:self
				field={{ ...field, label: undefined, help: undefined }}
				{value}
				{onchange}
				{oncommit}
				{getValue}
				{onFieldChange}
				{onFieldCommit}
				{filter}
				externalLabel={true}
			/>
		</div>
	</div>

{:else if field.type === 'tabs' && field.fields}
	<TabsField {field} {getValue} {onFieldChange} {onFieldCommit} {filter} />

{:else if field.type === 'tab' && field.fields}
	<!-- Tabs handle rendering their own tab content -->

{:else if field.type === 'section' || field.type === 'fieldset'}
	<SectionField field={hideTitleSections.has(field.name) ? { ...field, title: undefined, label: undefined } : field} {getValue} {onFieldChange} {onFieldCommit} {filter} />

{:else if field.type === 'columns' && field.fields}
	{@const processed = (() => {
		/** Recursively extract fields by name from a field tree, removing them from their parent */
		function extractFields(fields: BlueprintField[], names: Set<string>): BlueprintField[] {
			const extracted: BlueprintField[] = [];
			for (const f of fields) {
				if (names.has(f.name)) {
					extracted.push(f);
				}
				if (f.fields) {
					extracted.push(...extractFields(f.fields, names));
				}
			}
			return extracted;
		}

		/** Remove fields by name from a tree (in place) and prune empty sections */
		function removeFields(fields: BlueprintField[], names: Set<string>): BlueprintField[] {
			return fields
				.filter(f => !names.has(f.name))
				.map(f => {
					if (f.fields) {
						const cleaned = removeFields(f.fields, names);
						return { ...f, fields: cleaned };
					}
					return f;
				})
				// Remove sections/fieldsets that are now empty
				.filter(f => {
					if ((f.type === 'section' || f.type === 'fieldset') && f.fields && f.fields.length === 0) return false;
					return true;
				});
		}

		// First: extract relocatable fields from later columns BEFORE suppression
		const rawCols = field.fields.map(col => ({
			name: col.name,
			fields: [...(col.fields ?? [])],
		}));
		const relocated: BlueprintField[] = [];
		if (rawCols.length >= 2 && relocateToFirstColumn.size > 0) {
			for (let i = 1; i < rawCols.length; i++) {
				relocated.push(...extractFields(rawCols[i].fields, relocateToFirstColumn));
			}
		}

		// Then: apply suppression
		const cols = rawCols.map(col => ({
			name: col.name,
			fields: col.fields.filter(f => !suppressedNames.has(f.name) && !suppressedTypes.has(f.type)),
		}));

		// Add relocated fields into the first section of column1 (so they appear inside the card)
		if (relocated.length > 0) {
			const firstSection = cols[0].fields.find(f => f.type === 'section' || f.type === 'fieldset');
			if (firstSection && firstSection.fields) {
				firstSection.fields = [...firstSection.fields, ...relocated];
			} else {
				cols[0].fields = [...cols[0].fields, ...relocated];
			}
		}

		return cols;
	})()}
	{@const nonEmptyCols = processed.filter(c => c.fields.length > 0)}
	<div class={nonEmptyCols.length > 1 ? 'grid gap-4 lg:grid-cols-2' : ''}>
		{#each nonEmptyCols as col (col.name)}
			<div class="space-y-4">
				{#each col.fields as childField (childField.name)}
					<svelte:self
						field={childField}
						value={getValue(childField.name)}
						onchange={(val: unknown) => onFieldChange(childField.name, val)}
						oncommit={onFieldCommit ? (val: unknown, old?: unknown) => onFieldCommit(childField.name, val, old) : undefined}
						{getValue}
						{onFieldChange}
						{onFieldCommit}
						{filter}
					/>
				{/each}
			</div>
		{/each}
	</div>

{:else if field.type === 'spacer'}
	<SpacerField {field} />

{:else if field.type === 'display'}
	{#if field.content || field.text || field.description}
		{@const displayText = translateLabel(field.content || field.text || field.description)}
		{#if field.markdown}
			<div class="prose prose-sm dark:prose-invert max-w-none text-muted-foreground">{@html marked.parse(displayText)}</div>
		{:else}
			<div class="text-sm text-muted-foreground">{displayText}</div>
		{/if}
	{/if}

{:else if field.type === 'range'}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="space-y-2" onfocusin={oncommit ? () => { if (!hasBlurBaseline) { blurOldValue = JSON.parse(JSON.stringify(value ?? null)); hasBlurBaseline = true; } } : undefined}
		onfocusout={oncommit ? () => { oncommit(value, blurOldValue); hasBlurBaseline = false; blurOldValue = undefined; } : undefined}>
		{#if field.label || field.help}
			<div>
				{#if field.label}
					<label class="text-sm font-semibold text-foreground">{translateLabel(field.label)}</label>
				{/if}
				{#if field.help}
					<p class="mt-0.5 text-xs text-muted-foreground">{translateLabel(field.help)}</p>
				{/if}
			</div>
		{/if}
		<div class="flex items-center gap-3">
			<input
				type="range"
				class="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
				value={value ?? field.default ?? 50}
				min={field.min ?? 0}
				max={field.max ?? 100}
				step={field.step ?? 1}
				oninput={(e) => onchange(Number((e.target as HTMLInputElement).value))}
			/>
			<span class="w-10 text-right font-mono text-sm font-medium text-foreground">{value ?? field.default ?? 50}</span>
			{#if field.append}
				<span class="text-sm text-muted-foreground">{translateLabel(field.append)}</span>
			{/if}
		</div>
	</div>

{:else if field.type === 'datetime'}
	<DateTimeField {field} {value} onchange={committingOnchange} />

{:else if field.type === 'folder-slug'}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div onfocusin={oncommit ? () => { if (!hasBlurBaseline) { blurOldValue = JSON.parse(JSON.stringify(value ?? null)); hasBlurBaseline = true; } } : undefined}
		onfocusout={oncommit ? () => { oncommit(value, blurOldValue); hasBlurBaseline = false; blurOldValue = undefined; } : undefined}>
		<FolderSlugField {field} {value} {onchange} {getValue} />
	</div>

{:else if field.type === 'text' && (field.wrapper_classes ?? '').includes('cron-selector')}
	<CronField {field} {value} onchange={committingOnchange} />

{:else if field.type === 'password'}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div data-translate={field.translate || undefined} data-field-name={field.translate ? field.name : undefined}
		onfocusin={oncommit ? () => { if (!hasBlurBaseline) { blurOldValue = JSON.parse(JSON.stringify(value ?? null)); hasBlurBaseline = true; } } : undefined}
		onfocusout={oncommit ? () => { oncommit(value, blurOldValue); hasBlurBaseline = false; blurOldValue = undefined; } : undefined}>
		<PasswordBlueprintField {field} {value} {onchange} />
	</div>

{:else if inputTypes.has(field.type)}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div data-translate={field.translate || undefined} data-field-name={field.translate ? field.name : undefined}
		onfocusin={oncommit ? () => { if (!hasBlurBaseline) { blurOldValue = JSON.parse(JSON.stringify(value ?? null)); hasBlurBaseline = true; } } : undefined}
		onfocusout={oncommit ? () => { oncommit(value, blurOldValue); hasBlurBaseline = false; blurOldValue = undefined; } : undefined}>
		<TextField {field} {value} {onchange} />
	</div>

{:else if (field.type === 'markdown' || field.type === 'editor') && field.name === 'content' && contentLock}
	<!-- Locked: a peer with a different editor type joined first.
		 Show the lock notice instead of mounting an editor that would
		 write into a CRDT shape the peer can't read. -->
	<EditorLockNotice ownerType={contentLock.ownerType} ownerName={contentLock.ownerName} />

{:else if field.type === 'markdown' && preferredEditor}
	<!-- User-preferred editor (e.g., editor-pro) for markdown fields -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div data-translate={field.translate || undefined} data-field-name={field.translate ? field.name : undefined}>
		<CustomFieldWrapper
			{field}
			{value}
			onchange={committingOnchange}
			{oncommit}
			pluginSlug={customFieldRegistry.getPluginSlug(preferredEditor) ?? ''}
			fieldType={preferredEditor}
		/>
	</div>

{:else if field.type === 'markdown' || field.type === 'editor'}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div data-translate={field.translate || undefined} data-field-name={field.translate ? field.name : undefined}
		onfocusin={oncommit ? () => { if (!hasBlurBaseline) { blurOldValue = JSON.parse(JSON.stringify(value ?? null)); hasBlurBaseline = true; } } : undefined}
		onfocusout={oncommit ? () => { oncommit(value, blurOldValue); hasBlurBaseline = false; blurOldValue = undefined; } : undefined}>
		<MarkdownField {field} {value} {onchange} />
	</div>

{:else if field.type === 'textarea'}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div data-translate={field.translate || undefined} data-field-name={field.translate ? field.name : undefined}
		onfocusin={oncommit ? () => { if (!hasBlurBaseline) { blurOldValue = JSON.parse(JSON.stringify(value ?? null)); hasBlurBaseline = true; } } : undefined}
		onfocusout={oncommit ? () => { oncommit(value, blurOldValue); hasBlurBaseline = false; blurOldValue = undefined; } : undefined}>
		<TextareaField {field} {value} {onchange} />
	</div>

{:else if field.type === 'select'}
	<SelectField {field} {value} onchange={committingOnchange} />

{:else if field.type === 'themeselect'}
	<ThemeSelectField {field} {value} onchange={committingOnchange} />

{:else if field.type === 'dateformat'}
	<DateFormatField {field} {value} onchange={committingOnchange} />

{:else if field.type === 'toggle' || field.type === 'switch'}
	<ToggleField {field} {value} onchange={committingOnchange} />

{:else if field.type === 'checkbox'}
	<div>
		<label class="flex cursor-pointer items-center gap-2.5">
			<input
				type="checkbox"
				class="h-[18px] w-[18px] shrink-0 appearance-none rounded border border-input bg-muted/50 checked:border-primary checked:bg-primary checked:bg-[url('data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22white%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M12.207%204.793a1%201%200%20010%201.414l-5%205a1%201%200%2001-1.414%200l-2-2a1%201%200%20011.414-1.414L6.5%209.086l4.293-4.293a1%201%200%20011.414%200z%22%2F%3E%3C%2Fsvg%3E')] checked:bg-no-repeat checked:bg-center"
				checked={!!value}
				onchange={(e) => { const v = (e.target as HTMLInputElement).checked; oncommit?.(v); onchange(v); }}
			/>
			<span class="text-sm font-semibold text-foreground">{translateLabel(field.label)}</span>
		</label>
		{#if field.help}
			<p class="mt-0.5 ml-7 text-xs text-muted-foreground">{translateLabel(field.help)}</p>
		{/if}
	</div>

{:else if field.type === 'checkboxes' && field.options}
	{@const useKeys = field.use === 'keys'}
	<div class="space-y-2">
		{#if field.label || field.help}
			<div>
				{#if field.label}
					<span class="block text-sm font-semibold text-foreground">{translateLabel(field.label)}</span>
				{/if}
				{#if field.help}
					<p class="mt-0.5 text-xs text-muted-foreground">{translateLabel(field.help)}</p>
				{/if}
			</div>
		{/if}
		<div class="space-y-1.5">
			{#each field.options as opt (opt.value)}
				{@const checked = useKeys
					? (value != null && typeof value === 'object' && !Array.isArray(value) && !!(value as Record<string, unknown>)[opt.value])
					: (Array.isArray(value) && value.includes(opt.value))}
				<label class="flex cursor-pointer items-center gap-2.5">
					<input type="checkbox" class="h-[18px] w-[18px] shrink-0 appearance-none rounded border border-input bg-muted/50 checked:border-primary checked:bg-primary checked:bg-[url('data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22white%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M12.207%204.793a1%201%200%20010%201.414l-5%205a1%201%200%2001-1.414%200l-2-2a1%201%200%20011.414-1.414L6.5%209.086l4.293-4.293a1%201%200%20011.414%200z%22%2F%3E%3C%2Fsvg%3E')] checked:bg-no-repeat checked:bg-center" {checked} onchange={(e) => {
						const isChecked = (e.target as HTMLInputElement).checked;
						let next;
						if (useKeys) {
							const obj = (value != null && typeof value === 'object' && !Array.isArray(value)) ? { ...(value as Record<string, unknown>) } : {};
							obj[opt.value] = isChecked;
							next = obj;
						} else {
							const arr = Array.isArray(value) ? [...value] : [];
							next = isChecked ? [...arr, opt.value] : arr.filter((v) => v !== opt.value);
						}
						oncommit?.(next);
						onchange(next);
					}} />
					<span class="text-sm text-foreground">{translateLabel(opt.label)}</span>
				</label>
			{/each}
		</div>
	</div>

{:else if field.type === 'radio' && field.options}
	<div class="space-y-2">
		{#if field.label || field.help}
			<div>
				{#if field.label}
					<span class="block text-sm font-semibold text-foreground">{translateLabel(field.label)}</span>
				{/if}
				{#if field.help}
					<p class="mt-0.5 text-xs text-muted-foreground">{translateLabel(field.help)}</p>
				{/if}
			</div>
		{/if}
		<div class="space-y-1">
			{#each field.options as opt (opt.value)}
				<label class="flex cursor-pointer items-center gap-2">
					<input type="radio" class="radio" name={field.name} value={opt.value} checked={value === opt.value} onchange={() => { oncommit?.(opt.value); onchange(opt.value); }} />
					<span class="text-sm text-muted-foreground">{translateLabel(opt.label)}</span>
				</label>
			{/each}
		</div>
	</div>

{:else if field.type === 'list' && field.fields}
	<ListField {field} {value} {onchange} {getValue} {onFieldChange} {onFieldCommit} />

{:else if field.type === 'array'}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div data-translate={field.translate || undefined} data-field-name={field.translate ? field.name : undefined}
		onfocusin={oncommit ? () => { if (!hasBlurBaseline) { blurOldValue = JSON.parse(JSON.stringify(value ?? null)); hasBlurBaseline = true; } } : undefined}
		onfocusout={oncommit ? () => { oncommit(value, blurOldValue); hasBlurBaseline = false; blurOldValue = undefined; } : undefined}>
		<ArrayField {field} {value} {onchange} />
	</div>

{:else if field.type === 'xss' || field.type === 'ignore' || field.type === 'nonce' || field.type === 'honeypot'}
	<!-- Skip non-visible system fields -->

{:else if field.type === 'pagemedia'}
	<PageMediaField />

{:else if field.type === 'filepicker' || field.type === 'mediapicker' || field.type === 'pagemediaselect'}
	<FilePickerField {field} {value} onchange={committingOnchange} />

{:else if field.type === 'file'}
	<FileField {field} {value} onchange={committingOnchange} />

{:else if field.type === 'pages' || field.type === 'parents'}
	<PagesField {field} {value} onchange={committingOnchange} />

{:else if field.type === 'taxonomy'}
	<TaxonomyField {field} {value} onchange={committingOnchange} />

{:else if field.type === 'selectize'}
	<SelectizeField {field} {value} onchange={committingOnchange} />

{:else if field.type === 'cron'}
	<CronField {field} {value} onchange={committingOnchange} />

{:else if field.type === 'multilevel'}
	<MultilevelField {field} {value} onchange={committingOnchange} />

{:else if field.type === 'colorpicker'}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div onfocusin={oncommit ? () => { if (!hasBlurBaseline) { blurOldValue = JSON.parse(JSON.stringify(value ?? null)); hasBlurBaseline = true; } } : undefined}
		onfocusout={oncommit ? () => { oncommit(value, blurOldValue); hasBlurBaseline = false; blurOldValue = undefined; } : undefined}>
		<TextField field={{ ...field, type: 'color' }} {value} {onchange} />
	</div>

{:else if field.type === 'elements'}
	<ElementsField {field} {value} {onchange} {getValue} {onFieldChange} {onFieldCommit} />

{:else if field.type === 'element'}
	<!-- Elements handle their own element children; standalone element is a no-op -->

{:else if field.type === 'conditional'}
	<ConditionalField {field} {getValue} {onFieldChange} {onFieldCommit} />

{:else if field.type === 'frontmatter' || field.type === 'codemirror'}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div onfocusin={oncommit ? () => { if (!hasBlurBaseline) { blurOldValue = JSON.parse(JSON.stringify(value ?? null)); hasBlurBaseline = true; } } : undefined}
		onfocusout={oncommit ? () => { oncommit(value, blurOldValue); hasBlurBaseline = false; blurOldValue = undefined; } : undefined}>
		<FrontmatterField {field} {value} {onchange} />
	</div>

{:else if field.type === 'iconpicker'}
	<IconPickerField {field} {value} onchange={committingOnchange} />

{:else if field.type === 'permissions' || field.type === 'acl_picker'}
	<PermissionsField {field} {value} onchange={committingOnchange} />

{:else if field.type === 'cronstatus'}
	<CronStatusField {field} {value} {onchange} />

{:else if field.type === 'webhook-status'}
	<WebhookStatusField {field} {value} {onchange} />

{:else if field.type === 'page-exists' && field.fields}
	<PageExistsField {field} {getValue} {onFieldChange} {onFieldCommit} />

{:else if customFieldRegistry.has(field.type)}
	<!-- Plugin-provided custom field via web component -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div data-translate={field.translate || undefined} data-field-name={field.translate ? field.name : undefined}>
		<CustomFieldWrapper
			{field}
			{value}
			onchange={committingOnchange}
			{oncommit}
			pluginSlug={customFieldRegistry.getPluginSlug(field.type) ?? ''}
			fieldType={field.type}
		/>
	</div>

{:else}
	<!-- Unknown field type — render as raw JSON editor -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div onfocusin={oncommit ? () => { if (!hasBlurBaseline) { blurOldValue = JSON.parse(JSON.stringify(value ?? null)); hasBlurBaseline = true; } } : undefined}
		onfocusout={oncommit ? () => { oncommit(value, blurOldValue); hasBlurBaseline = false; blurOldValue = undefined; } : undefined}>
		<RawField {field} {value} {onchange} />
	</div>
{/if}
