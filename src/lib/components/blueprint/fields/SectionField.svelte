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

	// Track toggleable field states — initialize eagerly (not in $effect)
	// to avoid state_unsafe_mutation when template reads during first render
	const initToggleStates = (): Record<string, boolean> => {
		const initial: Record<string, boolean> = {};
		if (field.fields) {
			for (const f of field.fields) {
				if (f.toggleable) {
					const val = getValue(f.name);
					initial[f.name] = val !== undefined && val !== null;
				}
			}
		}
		return initial;
	};
	let toggleStates = $state<Record<string, boolean>>(initToggleStates());

	function toggleField(name: string, fieldDef: BlueprintField) {
		const current = toggleStates[name] ?? false;
		toggleStates = { ...toggleStates, [name]: !current };
		if (current) {
			// Toggling OFF — signal removal
			onFieldChange(name, undefined);
		} else {
			// Toggling ON — restore default value if the current value is undefined
			const currentVal = getValue(name);
			if (currentVal === undefined || currentVal === null) {
				onFieldChange(name, fieldDef.default ?? '');
			}
		}
	}

	function isToggleOn(f: BlueprintField): boolean {
		if (!f.toggleable) return true;
		return toggleStates[f.name] ?? false;
	}
</script>

{#snippet toggleCheckbox(fieldDef: BlueprintField, toggled: boolean)}
	<button
		type="button"
		class="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border transition-colors
			{toggled
				? 'border-primary bg-primary'
				: 'border-input bg-muted/50'}"
		onclick={() => toggleField(fieldDef.name, fieldDef)}
	>
		{#if toggled}
			<svg class="h-3 w-3 text-white" viewBox="0 0 16 16" fill="currentColor"><path d="M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z"/></svg>
		{/if}
	</button>
{/snippet}

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
				{@const toggled = isToggleOn(childField)}

				{#if isVertical(childField)}
					<div class="transition-opacity {childField.toggleable && !toggled ? 'pointer-events-none opacity-50' : ''}">
						<FieldRenderer
							field={childField}
							value={getValue(childField.name)}
							onchange={(val) => onFieldChange(childField.name, val)}
							{getValue}
							{onFieldChange}
						/>
					</div>
				{:else}
					<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
						<div class="flex items-start gap-2 lg:pt-2.5">
							{#if childField.toggleable}
								{@render toggleCheckbox(childField, toggled)}
							{/if}
							<div>
								{#if childField.label}
									<span class="text-sm font-semibold {toggled ? 'text-foreground' : 'text-muted-foreground'}">
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
						</div>
						<div class="transition-opacity {childField.toggleable && !toggled ? 'pointer-events-none opacity-50' : ''}">
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
