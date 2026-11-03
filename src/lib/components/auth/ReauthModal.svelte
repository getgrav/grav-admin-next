<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	/**
	 * In-place re-auth modal. Opens when token expiry or refresh failure is
	 * detected. Preserves the current route and any queued API requests, then
	 * swaps in the new token and retries them — the user never loses state.
	 *
	 * The modal is intentionally mounted at the app shell level so it overlays
	 * whatever view is active (blueprint editor, media upload, etc.).
	 *
	 * It offers every sign-in method the login page does, because it is a session
	 * recovery path rather than a password check. An SSO-only account has no
	 * password at all (login-oauth2 never writes one), so a password-only modal
	 * is a dead end for those users: their only exit is Sign out, which drops the
	 * queued requests and the current route — the exact loss this modal prevents.
	 *
	 * Sign-in goes through the shared login()/verify2fa() helpers rather than a
	 * hand-rolled fetch, so the 2FA challenge and the captcha are handled the same
	 * way here as on the login page.
	 */
	import { tick, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import { auth } from '$lib/stores/auth.svelte';
	import { authSession } from '$lib/stores/auth-session.svelte';
	import {
		CAPTCHA_DISABLED,
		exchangeSsoCode,
		getCaptchaConfig,
		getLoginOptions,
		login,
		verify2fa,
		type CaptchaConfig,
		type SsoProvider,
	} from '$lib/api/auth';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import LoginCaptcha from '$lib/components/auth/LoginCaptcha.svelte';
	import { LockKeyhole, Loader2 } from 'lucide-svelte';

	let password = $state('');
	let code = $state('');
	let stage = $state<'password' | '2fa'>('password');
	let challengeToken = $state('');
	let submitting = $state(false);
	let error = $state<string | null>(null);

	let ssoProviders = $state<SsoProvider[]>([]);
	// Off when the server hides the password form (e.g. SSO enforced).
	let showPasswordForm = $state(true);
	// Whether this opening's sign-in options have arrived, or the wait ran out.
	// Until then the dialog shows a spinner, not a form that may be about to go.
	let optionsLoaded = $state(false);
	// False when the last load couldn't reach the server. Plain, not $state:
	// nothing renders from it.
	let optionsOk = true;
	let ssoBusy = $state<string | null>(null);

	let captchaConfig = $state<CaptchaConfig>(CAPTCHA_DISABLED);
	let captchaReady = $state(false);
	let captcha = $state<{ token: () => Promise<string>; reset: () => void } | null>(null);

	/** The provider round-trip, when it is running in a popup we opened. */
	let ssoWindow: Window | null = null;
	let ssoPoll: ReturnType<typeof setInterval> | null = null;

	// Focus the first thing to use once it is there: the code, the password or
	// the first provider button, and the dialog itself while the options load.
	// Runs again when the stage or the options change, so focus never stays on
	// a field that went away. The Input doesn't forward refs, so grab by id.
	$effect(() => {
		if (!authSession.reauthOpen) return;
		const target =
			stage === '2fa'
				? '#reauth-code'
				: !optionsLoaded
					? '#reauth-dialog'
					: showPasswordForm
						? '#reauth-password'
						: '#reauth-sso button';
		tick().then(() => {
			const el = document.querySelector<HTMLElement>(target) ?? document.getElementById('reauth-dialog');
			el?.focus();
		});
	});

	// If the backend has no user accounts (e.g. the account backing the stored
	// token was removed), reauth can never succeed — bounce the user to the
	// first-run setup wizard instead of letting them sit on a dead modal.
	$effect(() => {
		if (!authSession.reauthOpen) return;
		const baseUrl = `${auth.serverUrl}${auth.apiPrefix || '/api/v1'}`;
		fetch(`${baseUrl}/auth/setup`, { headers: { Accept: 'application/json' } })
			.then((r) => (r.ok ? r.json() : null))
			.then((body) => {
				const data = body?.data ?? body;
				if (data?.setup_required) {
					authSession.rejectPending(new Error('Setup required'));
					authSession.closeReauth();
					authSession.stop();
					auth.logout();
					goto(`${base}/setup`);
				}
			})
			.catch(() => { /* best-effort — fall through to password prompt */ });
	});

	// Load the sign-in options and the captcha config each time the modal opens,
	// the same best-effort way the login page does: a load that failed last time
	// gets another go, and a changed setting shows. Deferred until open so a
	// session that never expires costs nothing. A slow server still gets the
	// form after a few seconds.
	let optionsProbe: AbortController | null = null;

	function loadOptions() {
		optionsProbe?.abort();
		const ctrl = new AbortController();
		optionsProbe = ctrl;
		getLoginOptions(ctrl.signal).then((options) => {
			if (ctrl.signal.aborted) return;
			ssoProviders = options.providers;
			showPasswordForm = options.showPasswordForm;
			optionsOk = options.ok;
			optionsLoaded = true;
		});
		getCaptchaConfig().then((config) => {
			if (!ctrl.signal.aborted) captchaConfig = config;
		});
	}

	$effect(() => {
		if (!authSession.reauthOpen) return;
		untrack(loadOptions);
		const timer = setTimeout(() => (optionsLoaded = true), 4000);
		return () => {
			clearTimeout(timer);
			optionsProbe?.abort();
			optionsLoaded = false;
		};
	});

	// After a failed load (a laptop waking up before its network, say), coming
	// back online or to this window asks again.
	function retryOptions() {
		if (!optionsOk) loadOptions();
	}

	/** Everything that has to happen once a fresh token pair is in the store. */
	async function completeReauth() {
		authSession.schedule();
		authSession.closeReauth();
		password = '';
		code = '';
		stage = 'password';
		challengeToken = '';
		error = null;

		// Retry queued requests — the API client supplies the retry callback
		// via a module-level registration (see api/client.ts).
		const retryFn = (window as any).__apiClientRetry__;
		if (retryFn) {
			await authSession.retryPending(retryFn);
		}
	}

	/**
	 * Same precedence the login page uses: our own wording for a rejected
	 * credential, the server's wording for anything it explains itself (rate
	 * limits especially), and a connection message when there is no response.
	 */
	function describeFailure(e: unknown, unauthorized: string): string {
		if (!e || typeof e !== 'object' || !('status' in e)) {
			return i18n.t('ADMIN_NEXT.LOGIN.UNABLE_TO_CONNECT_TO_SERVER_CHECK_YOUR');
		}
		const err = e as { status: number; message?: string };
		return err.status === 401 ? unauthorized : err.message || unauthorized;
	}

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (submitting || !password.trim()) return;

		submitting = true;
		error = null;
		try {
			// Tokens are single use and the API consumes one even on a failed
			// attempt, so this has to be fetched per submit and reset after.
			const captchaToken = captcha ? await captcha.token() : '';
			const result = await login(auth.username, password, captchaToken);

			if (result.requires2fa && result.challengeToken) {
				challengeToken = result.challengeToken;
				stage = '2fa';
				code = '';
				return;
			}

			await completeReauth();
		} catch (e) {
			error = describeFailure(e, i18n.t('ADMIN_NEXT.LOGIN.INVALID_USERNAME_OR_PASSWORD'));
		} finally {
			captcha?.reset();
			submitting = false;
		}
	}

	async function handleVerify(e: SubmitEvent) {
		e.preventDefault();
		if (submitting || !code.trim()) return;

		submitting = true;
		error = null;
		try {
			await verify2fa(challengeToken, code.trim());
			await completeReauth();
		} catch (e) {
			error = describeFailure(e, i18n.t('ADMIN_NEXT.LOGIN.INVALID_AUTHENTICATION_CODE'));
			code = '';
		} finally {
			submitting = false;
		}
	}

	function stopSsoWatch() {
		if (ssoPoll) {
			clearInterval(ssoPoll);
			ssoPoll = null;
		}
		ssoWindow = null;
		ssoBusy = null;
	}

	/**
	 * Run the provider round-trip in a popup so the SPA survives it.
	 *
	 * The exchange step is cache-backed rather than session-backed on the server
	 * precisely so it works from a window that carries no session cookie, which
	 * is what makes this possible without an API change. If the popup is blocked
	 * we fall back to the login page's full-page redirect, carrying returnTo so
	 * the user at least lands back on the route they were on.
	 */
	function startSso(id: string) {
		if (submitting || ssoBusy) return;

		const prefix = auth.apiPrefix || '/api/v1';
		const returnTo = page.url.pathname + page.url.search;
		const url =
			`${auth.serverUrl}${prefix}/auth/sso/${encodeURIComponent(id)}/start` +
			`?returnTo=${encodeURIComponent(`${base}/oauth-callback`)}`;

		error = null;
		ssoBusy = id;

		const popup = window.open(url, 'grav-sso', 'width=560,height=720,menubar=no,toolbar=no');
		if (!popup) {
			// Blocked. Preserving state is no longer on the table, so take the
			// redirect and at least keep the user's place.
			authSession.rejectPending(new Error('Re-authenticating'));
			window.location.href =
				`${auth.serverUrl}${prefix}/auth/sso/${encodeURIComponent(id)}/start` +
				`?returnTo=${encodeURIComponent(returnTo)}`;
			return;
		}

		ssoWindow = popup;

		// The popup posts back on success. This only catches the user closing it.
		ssoPoll = setInterval(() => {
			if (ssoWindow?.closed) stopSsoWatch();
		}, 500);
	}

	async function handleSsoMessage(event: MessageEvent) {
		if (event.origin !== window.location.origin) return;
		const data = event.data as { type?: string; code?: string | null; error?: boolean } | null;
		if (!data || data.type !== 'grav:sso') return;

		stopSsoWatch();

		if (data.error || !data.code) {
			error = i18n.t('ADMIN_NEXT.LOGIN.SSO_FAILED');
			return;
		}

		submitting = true;
		try {
			const result = await exchangeSsoCode(data.code);
			if (result.requires2fa && result.challengeToken) {
				challengeToken = result.challengeToken;
				stage = '2fa';
				code = '';
				return;
			}
			await completeReauth();
		} catch {
			error = i18n.t('ADMIN_NEXT.LOGIN.SSO_FAILED');
		} finally {
			submitting = false;
		}
	}

	async function handleSignOut() {
		stopSsoWatch();
		authSession.rejectPending(new Error('User signed out'));
		authSession.closeReauth();
		authSession.stop();
		auth.logout();
		await goto(`${base}/login`);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key !== 'Escape') return;
		// Escape out of the 2FA stage first, so a mistyped code isn't a sign-out.
		if (stage === '2fa') {
			stage = 'password';
			challengeToken = '';
			code = '';
			error = null;
			return;
		}
		handleSignOut();
	}
</script>

<svelte:window
	onkeydown={authSession.reauthOpen ? handleKeydown : undefined}
	onmessage={authSession.reauthOpen ? handleSsoMessage : undefined}
	ononline={authSession.reauthOpen ? retryOptions : undefined}
	onfocus={authSession.reauthOpen ? retryOptions : undefined}
/>

{#if authSession.reauthOpen}
	<div
		id="reauth-dialog"
		class="fixed inset-0 z-[60] flex items-center justify-center bg-neutral-900/75 p-4 outline-none backdrop-blur-sm"
		role="dialog"
		aria-modal="true"
		aria-labelledby="reauth-title"
		tabindex="-1"
	>
		<div class="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl">
			<div class="flex gap-4">
				<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
					<LockKeyhole size={20} class="text-primary" />
				</div>
				<div class="min-w-0 flex-1">
					<h3 id="reauth-title" class="text-base font-semibold text-foreground">
						{i18n.t('ADMIN_NEXT.REAUTH_MODAL.SESSION_EXPIRED')}
					</h3>
					<p class="mt-1.5 text-sm text-muted-foreground">
						{#if stage === '2fa'}
							{@html i18n.tHtml('ADMIN_NEXT.LOGIN.AUTH_CODE_PROMPT', { username: auth.username })}
						{:else}
							{i18n.t('ADMIN_NEXT.REAUTH_MODAL.SIGN_IN_AGAIN_TO_CONTINUE')}
						{/if}
					</p>
				</div>
			</div>

			{#if stage === 'password'}
				{#if !optionsLoaded}
					<div class="mt-5 flex justify-center py-3 text-muted-foreground" role="status">
						<Loader2 size={18} class="animate-spin" />
						<span class="sr-only">{i18n.t('ADMIN_NEXT.LOADING')}</span>
					</div>
				{:else if showPasswordForm}
					<form onsubmit={handleSubmit} class="mt-5 space-y-3">
						<div>
							<label for="reauth-username" class="text-[0.8125rem] font-medium text-foreground">
								{i18n.t('ADMIN_NEXT.USERNAME')}
							</label>
							<Input
								id="reauth-username"
								type="text"
								value={auth.username}
								disabled
								class="mt-1.5"
							/>
						</div>
						<div>
							<label for="reauth-password" class="text-[0.8125rem] font-medium text-foreground">
								{i18n.t('ADMIN_NEXT.PASSWORD')}
							</label>
							<Input
								id="reauth-password"
								type="password"
								value={password}
								oninput={(e) => (password = (e.currentTarget as HTMLInputElement).value)}
								autocomplete="current-password"
								required
								class="mt-1.5"
							/>
						</div>

						<LoginCaptcha
							bind:this={captcha}
							bind:ready={captchaReady}
							config={captchaConfig}
							flow={captchaConfig.flows.login}
						/>

						{#if error}
							<p class="text-[0.8125rem] text-destructive">{error}</p>
						{/if}
						<div class="flex justify-end gap-2 pt-1">
							<Button type="button" variant="outline" size="sm" onclick={handleSignOut} disabled={submitting}>
								{i18n.t('ADMIN_NEXT.SIGN_OUT')}
							</Button>
							<Button type="submit" size="sm" disabled={submitting || !password.trim() || !captchaReady}>
								{#if submitting}
									<Loader2 size={14} class="animate-spin" />
								{/if}
								{submitting
									? i18n.t('ADMIN_NEXT.LOGIN.SIGNING_IN')
									: i18n.t('ADMIN_NEXT.LOGIN.SIGN_IN')}
							</Button>
						</div>
					</form>
				{/if}

				{#if optionsLoaded && ssoProviders.length > 0}
					<div id="reauth-sso" class="mt-5">
						{#if showPasswordForm}
							<div class="relative mb-3 flex items-center">
								<div class="flex-grow border-t border-border"></div>
								<span class="mx-3 text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
									{i18n.t('ADMIN_NEXT.LOGIN.OR_CONTINUE_WITH')}
								</span>
								<div class="flex-grow border-t border-border"></div>
							</div>
						{/if}
						<div class="space-y-2">
							{#each ssoProviders as provider (provider.id)}
								<Button
									type="button"
									variant="outline"
									size="sm"
									class="w-full"
									disabled={submitting || Boolean(ssoBusy)}
									onclick={() => startSso(provider.id)}
								>
									{#if ssoBusy === provider.id}
										<Loader2 size={14} class="animate-spin" />
									{/if}
									{i18n.t('ADMIN_NEXT.LOGIN.CONTINUE_WITH', { provider: provider.label })}
								</Button>
							{/each}
						</div>
					</div>
				{/if}
				{#if !optionsLoaded || !showPasswordForm}
					{#if error}
						<p class="mt-3 text-[0.8125rem] text-destructive">{error}</p>
					{/if}
					<div class="flex justify-end pt-4">
						<Button type="button" variant="outline" size="sm" onclick={handleSignOut} disabled={submitting}>
							{i18n.t('ADMIN_NEXT.SIGN_OUT')}
						</Button>
					</div>
				{/if}
			{:else}
				<form onsubmit={handleVerify} class="mt-5 space-y-3">
					<div>
						<label for="reauth-code" class="text-[0.8125rem] font-medium text-foreground">
							{i18n.t('ADMIN_NEXT.LOGIN.AUTHENTICATION_CODE')}
						</label>
						<Input
							id="reauth-code"
							type="text"
							inputmode="numeric"
							autocomplete="one-time-code"
							value={code}
							oninput={(e) => (code = (e.currentTarget as HTMLInputElement).value)}
							required
							class="mt-1.5 text-center tracking-[0.3em]"
						/>
					</div>
					{#if error}
						<p class="text-[0.8125rem] text-destructive">{error}</p>
					{/if}
					<div class="flex justify-end gap-2 pt-1">
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={submitting}
							onclick={() => { stage = 'password'; challengeToken = ''; code = ''; error = null; }}
						>
							{i18n.t('ADMIN_NEXT.BACK')}
						</Button>
						<Button type="submit" size="sm" disabled={submitting || !code.trim()}>
							{#if submitting}
								<Loader2 size={14} class="animate-spin" />
							{/if}
							{i18n.t('ADMIN_NEXT.LOGIN.VERIFY')}
						</Button>
					</div>
				</form>
			{/if}
		</div>
	</div>
{/if}
