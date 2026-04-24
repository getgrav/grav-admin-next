<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { fieldSizeClass } from '$lib/utils/field-size';
	import PasswordField from '$lib/components/ui/PasswordField.svelte';
	import { passwordPolicy } from '$lib/stores/passwordPolicy.svelte';

	interface Props {
		field: BlueprintField;
		value: unknown;
		onchange: (value: unknown) => void;
	}

	let { field, value, onchange }: Props = $props();
	const translateLabel = i18n.tMaybe;

	$effect(() => {
		passwordPolicy.load().catch(() => {});
	});

	const current = $derived((value as string | null | undefined) ?? '');
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
	<div class={fieldSizeClass(field.size)}>
		<PasswordField
			id={field.name}
			label=""
			value={current}
			onchange={(v) => onchange(v)}
			policy={passwordPolicy.current}
			autocomplete="new-password"
			placeholder={field.placeholder}
			showMeter={true}
			showHint={true}
		/>
	</div>
</div>
