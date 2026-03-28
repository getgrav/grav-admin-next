<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import FieldRenderer from '../FieldRenderer.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';

	interface Props {
		field: BlueprintField;
		getValue: (path: string) => unknown;
		onFieldChange: (path: string, value: unknown) => void;
	}

	let { field, getValue, onFieldChange }: Props = $props();
	const translateLabel = i18n.tMaybe;

	function isVertical(f: BlueprintField): boolean {
		return f.style === 'vertical';
	}
</script>

<div class="rounded-xl border border-border bg-muted/30">
	{#if field.title || field.label}
		<div class="px-6 pt-6 pb-2">
			<h3 class="text-base font-bold text-foreground">
				{translateLabel(field.title || field.label)}
			</h3>
			{#if field.description}
				<p class="mt-1 text-sm text-muted-foreground">{translateLabel(field.description)}</p>
			{/if}
		</div>
	{/if}

	{#if field.fields}
		<div class="space-y-5 px-6 py-5">
			{#each field.fields as childField (childField.name)}
				{#if isVertical(childField)}
					<!-- Vertical: stacked full-width layout -->
					<FieldRenderer
						field={childField}
						value={getValue(childField.name)}
						onchange={(val) => onFieldChange(childField.name, val)}
						{getValue}
						{onFieldChange}
					/>
				{:else}
					<!-- Horizontal (default): 2-col grid on lg -->
					<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
						<div class="lg:pt-2.5">
							{#if childField.label}
								<span class="text-sm font-semibold text-foreground">
									{translateLabel(childField.label)}
									{#if childField.validate?.required}
										<span class="text-red-500">*</span>
									{/if}
								</span>
							{/if}
							{#if childField.help}
								<p class="mt-0.5 text-xs text-muted-foreground">{translateLabel(childField.help)}</p>
							{/if}
						</div>
						<div>
							<FieldRenderer
								field={{ ...childField, label: undefined, help: undefined }}
								value={getValue(childField.name)}
								onchange={(val) => onFieldChange(childField.name, val)}
								{getValue}
								{onFieldChange}
							/>
						</div>
					</div>
				{/if}
			{/each}
		</div>
	{/if}
</div>
