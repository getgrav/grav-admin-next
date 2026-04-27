<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { Info, Check, X, Eye, EyeOff } from 'lucide-svelte';
	import { evaluatePassword, type PasswordPolicy } from '$lib/utils/passwordStrength';

	interface Props {
		value: string;
		policy: PasswordPolicy | null;
		id?: string;
		name?: string;
		label?: string;
		placeholder?: string;
		autocomplete?: HTMLInputAttributes['autocomplete'];
		disabled?: boolean;
		invalid?: boolean;
		invalidMessage?: string;
		showMeter?: boolean;
		showHint?: boolean;
		inputClass?: string;
		/** When set, the component operates in controlled (one-way) mode:
		 *  writes go through this callback instead of back through bind:value. */
		onchange?: (value: string) => void;
	}

	let {
		value = $bindable(),
		policy,
		id = 'password',
		name,
		label = 'Password',
		placeholder,
		autocomplete = 'new-password',
		disabled = false,
		invalid = false,
		invalidMessage,
		showMeter = true,
		showHint = true,
		inputClass = '',
		onchange,
	}: Props = $props();

	let modalOpen = $state(false);
	let revealed = $state(false);

	const result = $derived(evaluatePassword(value ?? '', policy));

	function handleBackdrop(e: MouseEvent) {
		if (e.target === e.currentTarget) modalOpen = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') modalOpen = false;
	}

	// Tailwind colors keyed by tier. Defined inline so the meter can animate
	// smoothly between states without JIT-missed classes.
	const barColors = {
		weak: 'bg-red-500',
		fair: 'bg-amber-500',
		good: 'bg-green-500',
		strong: 'bg-emerald-500',
	} as const;
</script>

<svelte:window onkeydown={modalOpen ? handleKeydown : undefined} />

<div class="space-y-1.5">
	{#if label || (showHint && policy && policy.rules.length > 0)}
		<div class="flex items-center justify-between">
			{#if label}
				<label for={id} class="text-[13px] font-medium text-foreground">{label}</label>
			{/if}
			{#if showHint && policy && policy.rules.length > 0}
				<button
					type="button"
					class="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
					onclick={() => (modalOpen = true)}
					tabindex="-1"
					aria-label={i18n.t('ADMIN_NEXT.PASSWORD_FIELD.PASSWORD_REQUIREMENTS')}
				>
					<Info size={12} />
					{i18n.t('ADMIN_NEXT.PASSWORD_FIELD.REQUIREMENTS')}
				</button>
			{/if}
		</div>
	{/if}

	<div class="relative {inputClass}">
		<input
			{id}
			{name}
			type={revealed ? 'text' : 'password'}
			{placeholder}
			{autocomplete}
			{disabled}
			{value}
			oninput={(e) => {
				const next = (e.currentTarget as HTMLInputElement).value;
				if (onchange) onchange(next);
				else value = next;
			}}
			class="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 pr-9 text-sm shadow-sm transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50
				{invalid ? 'border-red-500 ring-1 ring-red-500/30' : 'border-input'}"
		/>
		<button
			type="button"
			class="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
			onclick={() => (revealed = !revealed)}
			{disabled}
			tabindex="-1"
			aria-label={revealed ? 'Hide password' : 'Show password'}
		>
			{#if revealed}
				<EyeOff size={14} />
			{:else}
				<Eye size={14} />
			{/if}
		</button>
	</div>

	{#if showMeter && (value?.length ?? 0) > 0}
		<div class="space-y-1 pt-0.5">
			<div
				class="h-1 w-full overflow-hidden rounded-full bg-muted"
				role="progressbar"
				aria-valuenow={result.score}
				aria-valuemin="0"
				aria-valuemax="100"
				aria-label={i18n.t('ADMIN_NEXT.PASSWORD_FIELD.PASSWORD_STRENGTH')}
			>
				<div
					class="h-full rounded-full transition-all duration-200 {barColors[result.tier]}"
					style="width: {result.score}%"
				></div>
			</div>
			{#if policy && policy.rules.length > 0}
				<div class="flex items-center justify-between text-[11px] text-muted-foreground">
					<span>
						{#if result.tier === 'weak'}
							Too weak
						{:else if result.tier === 'fair'}
							Getting there
						{:else if result.tier === 'good'}
							Good
						{:else}
							Strong
						{/if}
					</span>
					<span>
						{result.rules.filter((r) => r.met).length} / {result.rules.length} requirements
					</span>
				</div>
			{/if}
		</div>
	{/if}

	{#if invalid && invalidMessage}
		<p class="text-xs text-red-500">{invalidMessage}</p>
	{/if}
</div>

{#if modalOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/75 p-4 backdrop-blur-sm"
		onclick={handleBackdrop}
	>
		<div class="flex w-full max-w-sm flex-col rounded-xl border border-border bg-card shadow-2xl">
			<div class="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
				<h2 class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.PASSWORD_FIELD.PASSWORD_REQUIREMENTS')}</h2>
				<button
					type="button"
					class="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					onclick={() => (modalOpen = false)}
					aria-label="Close"
				>
					<X size={14} />
				</button>
			</div>
			<ul class="space-y-2 px-5 py-4">
				{#each result.rules as check (check.rule.id)}
					<li class="flex items-start gap-2 text-[13px]">
						<span
							class="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full {check.met
								? 'bg-green-500/15 text-green-600 dark:text-green-400'
								: 'bg-muted text-muted-foreground'}"
						>
							{#if check.met}
								<Check size={10} strokeWidth={3} />
							{:else}
								<X size={10} strokeWidth={3} />
							{/if}
						</span>
						<span class={check.met ? 'text-foreground' : 'text-muted-foreground'}>
							{check.rule.label}
						</span>
					</li>
				{/each}
			</ul>
		</div>
	</div>
{/if}
