<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import TabsField from './fields/TabsField.svelte';
	import SectionField from './fields/SectionField.svelte';
	import SpacerField from './fields/SpacerField.svelte';
	import TextField from './fields/TextField.svelte';
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
		'hidden'
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

{:else if field.type === 'range'}
	<div class="space-y-2">
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

{:else if inputTypes.has(field.type)}
	<TextField {field} {value} {onchange} />

{:else if field.type === 'markdown' || field.type === 'editor'}
	<MarkdownField {field} {value} {onchange} />

{:else if field.type === 'textarea'}
	<TextareaField {field} {value} {onchange} />

{:else if field.type === 'select'}
	<SelectField {field} {value} {onchange} />

{:else if field.type === 'themeselect'}
	<ThemeSelectField {field} {value} {onchange} />

{:else if field.type === 'dateformat'}
	<DateFormatField {field} {value} {onchange} />

{:else if field.type === 'toggle' || field.type === 'switch'}
	<ToggleField {field} {value} {onchange} />

{:else if field.type === 'checkbox'}
	<div>
		<label class="flex cursor-pointer items-center gap-2">
			<input
				type="checkbox"
				class="checkbox"
				checked={!!value}
				onchange={(e) => onchange((e.target as HTMLInputElement).checked)}
			/>
			<span class="text-sm font-semibold text-foreground">{translateLabel(field.label)}</span>
		</label>
		{#if field.help}
			<p class="mt-0.5 ml-6 text-xs text-muted-foreground">{translateLabel(field.help)}</p>
		{/if}
	</div>

{:else if field.type === 'checkboxes' && field.options}
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
					<input type="checkbox" class="checkbox" checked={Array.isArray(value) && value.includes(opt.value)} />
					<span class="text-sm text-muted-foreground">{translateLabel(opt.label)}</span>
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
					<input type="radio" class="radio" name={field.name} value={opt.value} checked={value === opt.value} onchange={() => onchange(opt.value)} />
					<span class="text-sm text-muted-foreground">{translateLabel(opt.label)}</span>
				</label>
			{/each}
		</div>
	</div>

{:else if field.type === 'list' && field.fields}
	<ListField {field} {value} {onchange} {getValue} {onFieldChange} />

{:else if field.type === 'array'}
	<ArrayField {field} {value} {onchange} />

{:else if field.type === 'xss' || field.type === 'ignore' || field.type === 'nonce' || field.type === 'honeypot'}
	<!-- Skip non-visible system fields -->

{:else if field.type === 'pagemedia'}
	<PageMediaField />

{:else if field.type === 'filepicker' || field.type === 'mediapicker' || field.type === 'file'}
	<!-- File picker fields — placeholder for now -->
	<div>
		{#if field.label}
			<span class="mb-1 block text-sm font-medium text-foreground">{translateLabel(field.label)}</span>
		{/if}
		<div class="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
			File picker — coming soon
		</div>
	</div>

{:else if field.type === 'pages' || field.type === 'parents'}
	<PagesField {field} {value} {onchange} />

{:else if field.type === 'taxonomy' || field.type === 'selectize'}
	<SelectizeField {field} {value} {onchange} />

{:else if field.type === 'cron'}
	<CronField {field} {value} {onchange} />

{:else if field.type === 'multilevel'}
	<MultilevelField {field} {value} {onchange} />

{:else if field.type === 'colorpicker'}
	<TextField field={{ ...field, type: 'color' }} {value} {onchange} />

{:else}
	<!-- Unknown field type — render as raw JSON editor -->
	<RawField {field} {value} {onchange} />
{/if}
