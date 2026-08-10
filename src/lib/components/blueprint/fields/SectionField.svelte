<script lang="ts">
	import { slide } from 'svelte/transition';
	import { ChevronDown } from 'lucide-svelte';
	import { renderMarkdownInline } from '$lib/utils/markdown';
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import FieldRenderer from '../FieldRenderer.svelte';
	import FieldOverrideIndicator from '../FieldOverrideIndicator.svelte';
	import DirectionalIcon from '$lib/components/ui/DirectionalIcon.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { fieldMatches, fieldMatchesSelf } from '$lib/utils/field-filter';
	import ToggleableCheckbox from '../ToggleableCheckbox.svelte';
	import {
		isToggleOn as toggleOn,
		displayValue as toggleDisplayValue,
		toggleValue,
	} from '$lib/utils/toggleable';

	interface Props {
		field: BlueprintField;
		getValue: (path: string) => unknown;
		onFieldChange: (path: string, value: unknown) => void;
		onFieldCommit?: (path: string, value: unknown, oldValue?: unknown) => void;
		filter?: string;
	}

	let { field, getValue, onFieldChange, onFieldCommit, filter = '' }: Props = $props();
	const translateLabel = i18n.tMaybe;

	// A collapsible section/fieldset gets a clickable header that toggles its
	// body. Initial state honours `collapsed`; only collapsible sections can
	// ever be collapsed. An active filter force-expands so matches stay visible.
	let collapsed = $state(field.collapsible ? (field.collapsed ?? false) : false);
	const isCollapsed = $derived(field.collapsible && !filter && collapsed);

	const visibleFields = $derived(
		filter && field.fields
			? field.fields.filter(f => fieldMatchesSelf(f, filter))
			: field.fields ?? []
	);

	// Fields that should always render full-width (no label column)
	const fullWidthTypes = new Set(['cronstatus', 'webhook-status', 'tabs', 'tab', 'section', 'fieldset', 'columns', 'column', 'pagemedia', 'spacer']);

	// Custom field types whose web component renders its own label — render them
	// full-width so the section doesn't also draw the blueprint label and double
	// it up (e.g. save-redirect's "After Save..."). FieldRenderer strips the label
	// before handing these to the web component. Matches selfLabeledTypes there.
	const selfLabeledTypes = new Set(['save-redirect']);

	// Fields suppressed in admin-next (same list as FieldRenderer)
	const suppressedNames = new Set(['order_title', 'header.order_by', 'header.order_manual', 'enabled', 'health_status', 'active_triggers', 'webhook_token_generate']);

	// Fields that get replaced by native Svelte components (not suppressed)
	const nativeReplacements = new Set(['webhook_examples']);

	function isSuppressed(f: BlueprintField): boolean {
		if (nativeReplacements.has(f.name)) return false;
		if (suppressedNames.has(f.name)) return true;
		// Suppress display fields with raw HTML/JS or empty content
		if (f.type === 'display') {
			const c = f.content || f.text || f.description || '';
			if (c === '' || c.includes('<script') || c.includes('<div id=')) return true;
		}
		return false;
	}

	function isVertical(f: BlueprintField): boolean {
		return f.style === 'vertical' || fullWidthTypes.has(f.type) || selfLabeledTypes.has(f.type);
	}

	// Toggleable state model is shared with FieldRenderer — see $lib/utils/toggleable.
	function isToggleOn(f: BlueprintField): boolean {
		return toggleOn(f, getValue(f.name));
	}

	function displayValue(f: BlueprintField, toggled: boolean): unknown {
		return toggleDisplayValue(f, getValue(f.name), toggled);
	}

	function toggleField(name: string, fieldDef: BlueprintField) {
		onFieldChange(name, toggleValue(fieldDef, isToggleOn(fieldDef)));
	}

	function highlight(text: string): string {
		if (!filter) return text;
		const escaped = filter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark class="bg-yellow-400/40 text-inherit rounded-sm">$1</mark>');
	}
</script>

{#if !filter || visibleFields.length > 0}
<div class="rounded-xl border border-border bg-muted/30">
	{#if field.title || field.label}
		{#snippet heading()}
			<h3 class="flex items-center gap-2 text-base font-bold text-foreground">
				{#if field.icon}
					<i class="fa-solid fa-{field.icon} text-sm text-muted-foreground"></i>
				{/if}
				<span>{translateLabel(field.title || field.label)}</span>
				{#if field.collapsible}
					<span class="ms-auto text-muted-foreground transition-transform duration-200 {isCollapsed ? '-rotate-90 rtl:rotate-90' : ''}">
						<ChevronDown size={16} />
					</span>
				{/if}
			</h3>
		{/snippet}
		{#snippet description()}
			{#if field.text || field.description}
				{@const desc = translateLabel(field.text || field.description)}
				{#if field.markdown}
					<p class="mt-1 text-sm text-muted-foreground">{@html renderMarkdownInline(desc)}</p>
				{:else}
					<p class="mt-1 text-sm text-muted-foreground">{@html desc}</p>
				{/if}
			{/if}
		{/snippet}
		{#if field.collapsible}
			<button
				type="button"
				class="flex w-full flex-col items-stretch px-6 pt-6 pb-2 text-start"
				aria-expanded={!isCollapsed}
				onclick={() => (collapsed = !collapsed)}
			>
				{@render heading()}
				{@render description()}
			</button>
		{:else}
			<div class="px-6 pt-6 pb-2">
				{@render heading()}
				{@render description()}
			</div>
		{/if}
	{/if}

	{#if visibleFields.length > 0 && !isCollapsed}
		<div class="space-y-5 px-6 py-5" transition:slide={{ duration: 200 }}>
			{#each visibleFields as childField (childField.name)}
				{@const toggled = isToggleOn(childField)}

				{#if isSuppressed(childField)}
					<!-- Suppressed in admin-next -->
				{:else if isVertical(childField)}
					<div class="transition-opacity {childField.toggleable && !toggled ? 'pointer-events-none opacity-50' : ''}">
						<FieldRenderer
							field={childField}
							value={displayValue(childField, toggled)}
							onchange={(val) => onFieldChange(childField.name, val)}
							oncommit={onFieldCommit ? (val: unknown, old?: unknown) => onFieldCommit(childField.name, val, old) : undefined}
							{getValue}
							{onFieldChange}
							{onFieldCommit}
						/>
					</div>
				{:else}
					<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_2fr] lg:items-start lg:gap-x-6">
						<div class="flex items-start gap-2 lg:pt-2.5">
							{#if childField.toggleable}
								<ToggleableCheckbox {toggled} onToggle={() => toggleField(childField.name, childField)} />
							{/if}
							<div>
								{#if childField.label}
									<span class="inline-flex items-center gap-1.5">
										<span class="text-sm font-semibold {toggled ? 'text-foreground' : 'text-muted-foreground'}">
											{#if filter}
												{@html highlight(translateLabel(childField.label))}
											{:else}
												{translateLabel(childField.label)}
											{/if}
											{#if childField.validate?.required}
												<span class="text-red-500">*</span>
											{/if}
										</span>
										<FieldOverrideIndicator path={childField.name} />
									</span>
								{/if}
								{#if childField.help}
									<p class="mt-0.5 text-xs text-muted-foreground">
										{#if filter}
											{@html highlight(translateLabel(childField.help))}
										{:else}
											{@html translateLabel(childField.help)}
										{/if}
									</p>
								{/if}
							</div>
						</div>
						<div class="transition-opacity {childField.toggleable && !toggled ? 'pointer-events-none opacity-50' : ''}">
							<FieldRenderer
								field={{ ...childField, label: undefined, help: undefined }}
								value={displayValue(childField, toggled)}
								onchange={(val) => onFieldChange(childField.name, val)}
								oncommit={onFieldCommit ? (val: unknown, old?: unknown) => onFieldCommit(childField.name, val, old) : undefined}
								{getValue}
								{onFieldChange}
								{onFieldCommit}
							/>
						</div>
					</div>
				{/if}
			{/each}
		</div>
	{/if}
</div>
{/if}
