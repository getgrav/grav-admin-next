<script lang="ts">
	import { onMount } from 'svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { base } from '$app/paths';
	import { forgotPassword, getCaptchaConfig, CAPTCHA_DISABLED, type CaptchaConfig } from '$lib/api/auth';
	import LoginCaptcha from '$lib/components/auth/LoginCaptcha.svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Sun, Moon, Mail, Loader2 } from 'lucide-svelte';
	import DirectionalIcon from '$lib/components/ui/DirectionalIcon.svelte';
	import { theme } from '$lib/stores/theme.svelte';
	import BrandLogo from '$lib/components/ui/BrandLogo.svelte';

	let email = $state('');
	let loading = $state(false);
	let submitted = $state(false);
	let emailInvalid = $state(false);

	// This endpoint sends mail, so it's a more attractive bot target than login
	// itself — the server gates it separately.
	let captchaConfig = $state<CaptchaConfig>(CAPTCHA_DISABLED);
	let captchaReady = $state(true);
	let captcha: { token: () => Promise<string>; reset: () => void } | null = $state(null);

	onMount(() => {
		getCaptchaConfig()
			.then((config) => { captchaConfig = config; })
			.catch(() => { /* no-op — no challenge if unavailable */ });
	});

	async function handleSubmit(e: Event) {
		e.preventDefault();
		emailInvalid = false;

		const trimmed = email.trim();
		if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
			emailInvalid = true;
			return;
		}

		loading = true;
		try {
			let captchaToken = '';
			try {
				captchaToken = (await captcha?.token()) ?? '';
			} catch (err) {
				toast.error(err instanceof Error ? err.message : i18n.t('ADMIN_NEXT.LOGIN.CAPTCHA_NOT_COMPLETED'));
				return;
			}

			const result = await forgotPassword(trimmed, captchaToken);
			submitted = true;
			toast.success(result.message ?? 'Reset email sent');
		} catch (err: unknown) {
			if (err && typeof err === 'object' && 'status' in err) {
				const apiErr = err as { status: number; message: string };
				if (apiErr.status === 429) {
					toast.error(apiErr.message || 'Too many reset requests. Try again later.');
				} else {
					toast.error(apiErr.message || 'Unable to send reset email');
				}
			} else {
				toast.error(i18n.t('ADMIN_NEXT.FORGOT.UNABLE_TO_CONNECT_TO_SERVER'));
			}
		} finally {
			loading = false;
			captcha?.reset();
		}
	}
</script>

<svelte:head>
	<title>{i18n.t('ADMIN_NEXT.FORGOT.FORGOT_PASSWORD_GRAV_ADMIN')}</title>
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
			<h1 class="text-2xl font-semibold tracking-tight text-foreground">{i18n.t('ADMIN_NEXT.FORGOT.FORGOT_PASSWORD')}</h1>
			<p class="mt-1 text-[0.8125rem] text-muted-foreground">
				{#if submitted}
					{i18n.t('ADMIN_NEXT.FORGOT.CHECK_INBOX')}
				{:else}
					{i18n.t('ADMIN_NEXT.FORGOT.SUBTITLE')}
				{/if}
			</p>
		</div>

		<div class="rounded-lg border border-border bg-card shadow-sm">
			{#if !submitted}
				<form onsubmit={handleSubmit} class="space-y-4 px-6 py-5" novalidate>
					<div class="space-y-1.5">
						<label for="email" class="text-[0.8125rem] font-medium text-foreground">{i18n.t('ADMIN_NEXT.FORGOT.EMAIL_ADDRESS')}</label>
						<div class="flex rounded-md shadow-sm">
							<span class="inline-flex items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-muted-foreground">
								<Mail size={13} />
							</span>
							<input
								id="email"
								type="email"
								autocomplete="email"
								class="flex h-9 w-full rounded-r-md border bg-transparent px-3 py-1 text-sm shadow-sm transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring
									{emailInvalid
										? 'border-red-500 ring-1 ring-red-500/30 animate-[shake_0.3s_ease-in-out]'
										: 'border-input'}"
								bind:value={email}
								disabled={loading}
							/>
						</div>
						{#if emailInvalid}
							<p class="text-xs text-red-500">{i18n.t('ADMIN_NEXT.FORGOT.ENTER_A_VALID_EMAIL_ADDRESS')}</p>
						{/if}
					</div>

					<LoginCaptcha
						bind:this={captcha}
						bind:ready={captchaReady}
						config={captchaConfig}
						flow={captchaConfig.flows.forgotPassword}
					/>

					<Button type="submit" class="w-full" disabled={loading || !captchaReady}>
						{#if loading}
							<Loader2 size={15} class="animate-spin" />
							{i18n.t('ADMIN_NEXT.FORGOT.SENDING')}
						{:else}
							<Mail size={15} />
							{i18n.t('ADMIN_NEXT.FORGOT.SEND_RESET_LINK')}
						{/if}
					</Button>
				</form>
			{:else}
				<div class="px-6 py-5 text-center text-[0.8125rem] text-muted-foreground">
					{i18n.t('ADMIN_NEXT.FORGOT.IF_AN_ACCOUNT_EXISTS_FOR_THAT_EMAIL_A')}
				</div>
			{/if}

			<div class="border-t border-border px-6 py-3">
				<a
					href="{base}/login"
					class="flex items-center justify-center gap-1.5 text-[0.75rem] font-medium text-muted-foreground transition-colors hover:text-foreground"
				>
					<DirectionalIcon name="arrow-back" size={12} />
					{i18n.t('ADMIN_NEXT.FORGOT.BACK_TO_SIGN_IN')}
				</a>
			</div>
		</div>
	</div>
</div>
