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

	// Opt-out of the password-strength UI for fields that aren't user passwords —
	// API keys, tokens, webhook secrets, etc. don't have a meaningful "strength"
	// and the policy hints just clutter the form. Blueprint authors set
	// `password_policy: false` to disable the meter + hint while keeping the
	// type:password masking and eye-reveal toggle from ui/PasswordField.
	const enforcePolicy = $derived((field as unknown as { password_policy?: boolean }).password_policy !== false);

	$effect(() => {
		if (enforcePolicy) passwordPolicy.load().catch(() => {});
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
				<p class="mt-0.5 text-xs text-muted-foreground">{@html translateLabel(field.help)}</p>
			{/if}
		</div>
	{/if}
	<div class={fieldSizeClass(field.size)}>
		<PasswordField
			id={field.name}
			label=""
			value={current}
			onchange={(v) => onchange(v)}
			policy={enforcePolicy ? passwordPolicy.current : undefined}
			autocomplete="new-password"
			placeholder={field.placeholder}
			showMeter={enforcePolicy}
			showHint={enforcePolicy}
		/>
	</div>
</div>
