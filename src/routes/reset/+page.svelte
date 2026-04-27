<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import { resetPassword } from '$lib/api/auth';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Sun, Moon, KeyRound, ArrowLeft, Loader2 } from 'lucide-svelte';
	import { theme } from '$lib/stores/theme.svelte';
	import BrandLogo from '$lib/components/ui/BrandLogo.svelte';
	import PasswordField from '$lib/components/ui/PasswordField.svelte';
	import { passwordPolicy } from '$lib/stores/passwordPolicy.svelte';
	import { evaluatePassword } from '$lib/utils/passwordStrength';

	const username = $derived(page.url.searchParams.get('user') ?? '');
	const token = $derived(page.url.searchParams.get('token') ?? '');

	let password = $state('');
	let confirmPassword = $state('');
	let loading = $state(false);
	let passwordInvalid = $state(false);
	let confirmInvalid = $state(false);

	$effect(() => {
		passwordPolicy.load().catch(() => {
			// Non-critical: field falls back to a generic validator when
			// the policy endpoint is unreachable.
		});
	});

	const missingParams = $derived(!username || !token);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		passwordInvalid = false;
		confirmInvalid = false;

		const result = evaluatePassword(password, passwordPolicy.current);
		if (!password || !result.allRulesMet) {
			passwordInvalid = true;
			return;
		}
		if (password !== confirmPassword) {
			confirmInvalid = true;
			return;
		}

		loading = true;
		try {
			await resetPassword(username, token, password);
			toast.success(i18n.t('ADMIN_NEXT.RESET.PASSWORD_RESET_SUCCESSFULLY_PLEASE_SIGN'));
			goto(`${base}/login`);
		} catch (err: unknown) {
			if (err && typeof err === 'object' && 'status' in err) {
				const apiErr = err as { status: number; message: string };
				if (apiErr.status === 429) {
					toast.error(apiErr.message || 'Too many attempts. Try again later.');
				} else if (apiErr.status === 422 || apiErr.status === 400) {
					toast.error(apiErr.message || 'Invalid or expired reset link.');
				} else {
					toast.error(apiErr.message || 'Unable to reset password');
				}
			} else {
				toast.error(i18n.t('ADMIN_NEXT.RESET.UNABLE_TO_CONNECT_TO_SERVER'));
			}
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>{i18n.t('ADMIN_NEXT.RESET.RESET_PASSWORD_GRAV_ADMIN')}</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-background p-4">
	<button
		type="button"
		class="absolute top-4 right-4 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
		onclick={() => theme.toggleColorMode()}
		aria-label={i18n.t('ADMIN_NEXT.TOGGLE_DARK_MODE')}
	>
		{#if theme.isDark}
			<Sun size={16} />
		{:else}
			<Moon size={16} />
		{/if}
	</button>

	<div class="w-full max-w-sm">
		<div class="mb-8 flex flex-col items-center text-center">
			<div class="mb-4">
				<BrandLogo size="login" />
			</div>
			<h1 class="text-2xl font-semibold tracking-tight text-foreground">{i18n.t('ADMIN_NEXT.RESET.RESET_PASSWORD')}</h1>
			<p class="mt-1 text-[13px] text-muted-foreground">
				{#if missingParams}
					{i18n.t('ADMIN_NEXT.RESET.INVALID_LINK')}
				{:else}
					{@html i18n.tHtml('ADMIN_NEXT.RESET.NEW_PASSWORD_FOR', { username })}
				{/if}
			</p>
		</div>

		<div class="rounded-lg border border-border bg-card shadow-sm">
			{#if missingParams}
				<div class="px-6 py-5 text-center text-[13px] text-muted-foreground">
					{i18n.t('ADMIN_NEXT.RESET.THIS_RESET_LINK_IS_MISSING_REQUIRED')}
				</div>
			{:else}
				<form onsubmit={handleSubmit} class="space-y-4 px-6 py-5" novalidate>
					<PasswordField
						id="password"
						label="New password"
						bind:value={password}
						policy={passwordPolicy.current}
						disabled={loading}
						invalid={passwordInvalid}
						invalidMessage="Password does not meet the required policy"
					/>

					<div class="space-y-1.5">
						<label for="confirm" class="text-[13px] font-medium text-foreground">{i18n.t('ADMIN_NEXT.RESET.CONFIRM_PASSWORD')}</label>
						<input
							id="confirm"
							type="password"
							autocomplete="new-password"
							class="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring
								{confirmInvalid
									? 'border-red-500 ring-1 ring-red-500/30 animate-[shake_0.3s_ease-in-out]'
									: 'border-input'}"
							bind:value={confirmPassword}
							disabled={loading}
						/>
						{#if confirmInvalid}
							<p class="text-xs text-red-500">{i18n.t('ADMIN_NEXT.RESET.PASSWORDS_DO_NOT_MATCH')}</p>
						{/if}
					</div>

					<Button type="submit" class="w-full" disabled={loading}>
						{#if loading}
							<Loader2 size={15} class="animate-spin" />
							{i18n.t('ADMIN_NEXT.RESET.RESETTING')}
						{:else}
							<KeyRound size={15} />
							Reset password
						{/if}
					</Button>
				</form>
			{/if}

			<div class="border-t border-border px-6 py-3">
				<a
					href="{base}/login"
					class="flex items-center justify-center gap-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
				>
					<ArrowLeft size={12} />
					{i18n.t('ADMIN_NEXT.RESET.BACK_TO_SIGN_IN')}
				</a>
			</div>
		</div>
	</div>
</div>
