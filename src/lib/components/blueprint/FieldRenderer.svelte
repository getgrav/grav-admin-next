<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import TabsField from './fields/TabsField.svelte';
	import SectionField from './fields/SectionField.svelte';
	import SpacerField from './fields/SpacerField.svelte';
	import TextField from './fields/TextField.svelte';
	import TextareaField from './fields/TextareaField.svelte';
	import SelectField from './fields/SelectField.svelte';
	import ToggleField from './fields/ToggleField.svelte';
	import RawField from './fields/RawField.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';

	interface Props {
		field: BlueprintField;
		value: unknown;
		onchange: (value: unknown) => void;
		getValue: (path: string) => unknown;
		onFieldChange: (path: string, value: unknown) => void;
	}

	let { field, value, onchange, getValue, onFieldChange }: Props = $props();

	// Use i18n.tMaybe for all label translation
	const translateLabel = i18n.tMaybe;

	// Map field types to components
	const inputTypes = new Set([
		'text', 'email', 'url', 'tel', 'password', 'number',
		'date', 'datetime', 'time', 'month', 'week', 'color',
		'range', 'hidden'
	]);

</script>

{#if field.type === 'tabs' && field.fields}
	<TabsField {field} {getValue} {onFieldChange} />

{:else if field.type === 'tab' && field.fields}
	<!-- Tabs handle rendering their own tab content -->

{:else if field.type === 'section' || field.type === 'fieldset'}
	<SectionField {field} {getValue} {onFieldChange} />

{:else if field.type === 'columns' && field.fields}
	<div class="grid gap-4 lg:grid-cols-2">
		{#each field.fields as col (col.name)}
			{#if col.fields}
				<div class="space-y-4">
					{#each col.fields as childField (childField.name)}
						<svelte:self
							field={childField}
							value={getValue(childField.name)}
							onchange={(val) => onFieldChange(childField.name, val)}
							{getValue}
							{onFieldChange}
						/>
					{/each}
				</div>
			{/if}
		{/each}
	</div>

{:else if field.type === 'spacer'}
	<SpacerField {field} />

{:else if field.type === 'display'}
	{#if field.text || field.description}
		<div class="text-sm text-muted-foreground">
			{translateLabel(field.text || field.description)}
		</div>
	{/if}

{:else if inputTypes.has(field.type)}
	<TextField {field} {value} {onchange} />

{:else if field.type === 'textarea' || field.type === 'markdown' || field.type === 'editor'}
	<TextareaField {field} {value} {onchange} />

{:else if field.type === 'select'}
	<SelectField {field} {value} {onchange} />

{:else if field.type === 'toggle' || field.type === 'switch'}
	<ToggleField {field} {value} {onchange} />

{:else if field.type === 'checkbox'}
	<label class="flex cursor-pointer items-center gap-2">
		<input
			type="checkbox"
			class="checkbox"
			checked={!!value}
			onchange={(e) => onchange((e.target as HTMLInputElement).checked)}
		/>
		<span class="text-sm text-foreground">{translateLabel(field.label)}</span>
	</label>

{:else if field.type === 'checkboxes' && field.options}
	<div>
		{#if field.label}
			<span class="mb-1 block text-sm font-medium text-foreground">{translateLabel(field.label)}</span>
		{/if}
		<div class="space-y-1">
			{#each Object.entries(field.options) as [val, label]}
				<label class="flex cursor-pointer items-center gap-2">
					<input type="checkbox" class="checkbox" checked={Array.isArray(value) && value.includes(val)} />
					<span class="text-sm text-muted-foreground">{translateLabel(label)}</span>
				</label>
			{/each}
		</div>
	</div>

{:else if field.type === 'radio' && field.options}
	<div>
		{#if field.label}
			<span class="mb-1 block text-sm font-medium text-foreground">{translateLabel(field.label)}</span>
		{/if}
		<div class="space-y-1">
			{#each Object.entries(field.options) as [val, label]}
				<label class="flex cursor-pointer items-center gap-2">
					<input type="radio" class="radio" name={field.name} value={val} checked={value === val} onchange={() => onchange(val)} />
					<span class="text-sm text-muted-foreground">{translateLabel(label)}</span>
				</label>
			{/each}
		</div>
	</div>

{:else if field.type === 'list' && field.fields}
	<!-- List (repeating field group) — fallback to JSON for now -->
	<RawField {field} {value} {onchange} />

{:else if field.type === 'array'}
	<RawField {field} {value} {onchange} />

{:else if field.type === 'xss' || field.type === 'ignore' || field.type === 'nonce' || field.type === 'honeypot'}
	<!-- Skip non-visible system fields -->

{:else if field.type === 'pagemedia' || field.type === 'filepicker' || field.type === 'mediapicker' || field.type === 'file'}
	<!-- Media fields — show label with placeholder for now -->
	<div>
		{#if field.label}
			<span class="mb-1 block text-sm font-medium text-foreground">{translateLabel(field.label)}</span>
		{/if}
		<div class="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
			{field.type === 'pagemedia' ? 'Page media manager' : 'File picker'} — coming soon
		</div>
	</div>

{:else if field.type === 'taxonomy' || field.type === 'selectize' || field.type === 'pages' || field.type === 'parents'}
	<!-- Complex picker fields — use text input as fallback -->
	<TextField {field} {value} {onchange} />

{:else if field.type === 'colorpicker'}
	<TextField field={{ ...field, type: 'color' }} {value} {onchange} />

{:else}
	<!-- Unknown field type — render as raw JSON editor -->
	<RawField {field} {value} {onchange} />
{/if}
