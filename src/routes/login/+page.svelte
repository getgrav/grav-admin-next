<script lang="ts">
	import { onMount, onDestroy, tick, untrack } from 'svelte';
	import { goto, replaceState } from '$app/navigation';
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import { auth } from '$lib/stores/auth.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import {
		login,
		verify2fa,
		getSetupStatus,
		getLoginOptions,
		getCaptchaConfig,
		getPasskeyEnabled,
		startPasskeySignIn,
		finishPasskeySignIn,
		CAPTCHA_DISABLED,
		type SsoProvider,
		type CaptchaConfig,
	} from '$lib/api/auth';
	import LoginCaptcha from '$lib/components/auth/LoginCaptcha.svelte';
	import { reportSsoToOpener } from '$lib/utils/sso-popup';
	import {
		autofillSupported,
		getPasskey,
		passkeyCancelled,
		passkeysSupported,
		passkeyUsedHere,
		rememberPasskeyUsed,
		type PasskeyRequestOptionsJSON,
		type PasskeyStart,
	} from '$lib/utils/webauthn';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Sun, Moon, LogIn, Server, Globe, ChevronDown, Loader2, ShieldCheck, KeyRound } from 'lucide-svelte';
	import DirectionalIcon from '$lib/components/ui/DirectionalIcon.svelte';
	import { theme } from '$lib/stores/theme.svelte';
	import { branding } from '$lib/stores/branding.svelte';
	import { prefs } from '$lib/stores/preferences.svelte';
	import { clearBootCache } from '$lib/stores/_bootCache';
	import BrandLogo from '$lib/components/ui/BrandLogo.svelte';

	const defaultUrl = import.meta.env.DEV ? 'http://localhost:5180/grav-api' : 'https://localhost/grav-api';
	// When admin2 injected __GRAV_CONFIG__, its serverUrl is a path-only base
	// (e.g. '' for a root-hosted site, '/grav-api' for a subfolder). That's the
	// correct same-origin value for requests, but it's meaningless to show in the
	// field, so display the full URL against the *actual* host the shell was served
	// from: window.location.origin + the injected base. Using the live origin
	// (never the canonical custom_base_url) keeps both alternate-host (#56) and
	// root-hosted (#58) logins same-origin, so the auth cookie/token are still sent.
	// In standalone/dev mode there's no injected config, so fall back to defaultUrl.
	function injectedServerUrl(): string {
		const base = auth.serverUrl;
		if (typeof window === 'undefined') return base;
		// base is normally a path-only base, but setServer() persists the full
		// displayed URL back into auth.serverUrl, so on a remount it can already
		// be absolute. Only prepend the live origin to a path; otherwise we'd
		// double it up (e.g. https://hosthttps://host).
		if (/^https?:\/\//i.test(base)) return base;
		return window.location.origin + base;
	}
	let serverUrl = $state(auth.hasGravConfig ? injectedServerUrl() : (auth.serverUrl || defaultUrl));
	// '' is Default (base user/config). A made-up 'localhost' here stuck for
	// users who can't list environments, so the switcher showed it forever.
	let environment = $state(auth.environment || '');
	let username = $state('');
	let password = $state('');
	let loading = $state(false);
	let showServerConfig = $state(!auth.serverUrl && !auth.hasGravConfig);
	let attempted = $state(false);

	type Stage = 'credentials' | '2fa';
	let stage = $state<Stage>('credentials');
	let challengeToken = $state('');
	let code = $state('');
	let codeInvalid = $state(false);

	let ssoProviders = $state<SsoProvider[]>([]);
	// Off when the server hides the password form (e.g. SSO enforced).
	let passwordFormOn = $state(true);
	// The server and environment the sign-in options were loaded for. They only
	// apply while the fields still name that server: editing either field drops
	// the provider buttons and brings the form back until its own options arrive.
	let optionsFor = $state<string | null>(null);
	const fieldsKey = $derived(`${serverUrl.replace(/\/+$/, '')}|${environment}`);
	const optionsApply = $derived(optionsFor === fieldsKey);
	const showPasswordForm = $derived(!optionsApply || passwordFormOn);
	const providers = $derived(optionsApply ? ssoProviders : []);
	// False when the last load couldn't reach the server, so coming back online
	// asks again. Plain, not $state: nothing renders from it.
	let optionsOk = true;

	let captchaConfig = $state<CaptchaConfig>(CAPTCHA_DISABLED);
	let captchaReady = $state(true);
	let captcha: { token: () => Promise<string>; reset: () => void } | null = $state(null);

	// Passkeys: shown when the site offers them (probed like SSO and captcha
	// below) and this browser can use them here.
	let passkeyEnabled = $state(false);
	let browserPasskeys = $state(false);
	const showPasskey = $derived(passkeyEnabled && browserPasskeys);
	// The passkey button leads only in a browser that has used one here before;
	// otherwise the password button stays primary (same rule as the site).
	const passkeyLeads = passkeyUsedHere();
	let passkeyBusy = $state(false);
	// A line under the passkey button after the browser's dialog. Closing the
	// dialog is not an error, so it reads calmly and never as a toast.
	let passkeyNotice = $state<{ text: string; tone: 'muted' | 'warn' } | null>(null);
	// The autofill (conditional) request waiting on the username field. Plain,
	// not $state: effects start and stop it and must not track it.
	let autofill: AbortController | null = null;
	// The 2FA stage's passkey options, fetched when the stage opens and reused
	// on click while the ticket is still good (it lasts five minutes).
	let twoStepStart = $state<PasskeyStart<PasskeyRequestOptionsJSON> | null>(null);
	let twoStepFetchedAt = 0;
	let twoStepFor = '';
	let twoStepOffered = $state(false);
	const TICKET_REUSE_MS = 4.5 * 60 * 1000;

	const usernameInvalid = $derived(attempted && stage === 'credentials' && !username.trim());
	const passwordInvalid = $derived(attempted && stage === 'credentials' && !password.trim());

	$effect(() => {
		if (!i18n.loaded) {
			auth.setServer(serverUrl, environment);
			i18n.loadPrefix('PLUGIN_LOGIN').then(() => {
				i18n.loadAllInBackground();
			});
		}
	});

	// Hold the form back until the setup probe has answered, the full string set
	// has arrived and the server has said which sign-in options it offers.
	// Otherwise a fresh install shows this form for a moment, with placeholder
	// labels, before the probe sends it on to /setup, and an SSO-only site shows
	// a password form that vanishes as it is typed into. A slow or unreachable
	// server still gets the form after a few seconds.
	let setupChecked = $state(!(auth.hasGravConfig || auth.serverUrl));
	let optionsLoaded = $state(!(auth.hasGravConfig || auth.serverUrl));
	let waitedLongEnough = $state(false);
	const ready = $derived(waitedLongEnough || (setupChecked && i18n.loaded && optionsLoaded));
	// A custom logo already carries the site's name, so the heading under it
	// would only repeat it. It stays in the page for screen readers.
	const logoNamesSite = $derived(branding.mode === 'custom' && !!(branding.urlLight || branding.urlDark));
	onMount(() => {
		const timer = setTimeout(() => (waitedLongEnough = true), 4000);
		return () => clearTimeout(timer);
	});

	// Probe for a fresh install with no user accounts — redirect to /setup so
	// the operator can create the first super-admin. Silently ignore failures
	// (e.g. server URL not yet configured) and fall through to the login form.
	// Gate on hasGravConfig too, like the SSO and captcha probes below: a
	// root-hosted install injects serverUrl='', and the effect above only copies
	// the full URL into auth.serverUrl while i18n is unloaded. On a repeat visit
	// the cached strings count as loaded, so serverUrl stayed '' and a site with
	// no accounts showed a login form nobody could use.
	$effect(() => {
		if (auth.hasGravConfig || auth.serverUrl) {
			getSetupStatus()
				.then((status) => {
					if (status.setup_required) goto(`${base}/setup`);
					else setupChecked = true;
				})
				.catch(() => { setupChecked = true; /* probe is best-effort */ });
		}
	});

	// The sign-in options (provider buttons, the password form), the captcha and
	// the passkey button all belong to one server. Ask the one the fields name,
	// best-effort: no buttons, no challenge and the form if it can't be reached.
	// An answer for a server the fields no longer name is dropped.
	let probe: AbortController | null = null;
	let probedFor: string | null = null;

	function probeServer(force = false) {
		const key = untrack(() => fieldsKey);
		if (key === probedFor && !force) return;
		probedFor = key;
		probe?.abort();
		const ctrl = new AbortController();
		probe = ctrl;
		captchaConfig = CAPTCHA_DISABLED;
		passkeyEnabled = false;
		getLoginOptions(ctrl.signal).then((options) => {
			if (ctrl.signal.aborted) return;
			ssoProviders = options.providers;
			passwordFormOn = options.showPasswordForm;
			optionsOk = options.ok;
			optionsFor = key;
			optionsLoaded = true;
		});
		getCaptchaConfig().then((config) => {
			if (!ctrl.signal.aborted) captchaConfig = config;
		});
		getPasskeyEnabled().then((enabled) => {
			if (!ctrl.signal.aborted) passkeyEnabled = enabled;
		});
	}

	// Ask once a server is known. Gate on hasGravConfig too: a root-hosted plugin
	// install injects serverUrl='' (valid same-origin), which is falsy — so
	// serverUrl alone would never fire here.
	$effect(() => {
		if (auth.hasGravConfig || auth.serverUrl) untrack(() => probeServer());
	});

	// A different server or environment in the fields: point the client at it
	// and ask it again, so its options replace the last server's.
	function serverFieldsChanged() {
		auth.setServer(serverUrl, environment);
		probeServer();
	}

	// After a failed load, coming back online asks again.
	function retryProbe() {
		if (!optionsOk) probeServer(true);
	}

	onDestroy(() => probe?.abort());

	onMount(() => {
		browserPasskeys = passkeysSupported();
	});

	// Offer passkeys in the username field's autofill while the credentials
	// form is up. Stopped when the passkey button is used or the password form
	// is sent, and started again if either doesn't sign in. Without the form
	// there is no field to offer them in; another server's options start it
	// over with that server's passkeys.
	$effect(() => {
		if (!showPasskey || !showPasswordForm || !ready || stage !== 'credentials') return;
		void optionsFor;
		startAutofill();
		return stopAutofill;
	});

	onDestroy(stopAutofill);

	function stopAutofill() {
		autofill?.abort();
		autofill = null;
	}

	async function startAutofill() {
		if (autofill || !showPasskey || !showPasswordForm || stage !== 'credentials') return;
		const ctrl = new AbortController();
		autofill = ctrl;
		try {
			if (!(await autofillSupported()) || ctrl.signal.aborted) return;
			await tick();
			auth.setServer(serverUrl, environment);
			const start = await startPasskeySignIn('sign-in');
			if (ctrl.signal.aborted) return;
			const credential = await getPasskey(start.options, { mediation: 'conditional', signal: ctrl.signal });
			if (ctrl.signal.aborted) return;
			loading = true;
			passkeyNotice = null;
			await finishPasskeySignIn('sign-in', start.ticket, credential);
			rememberPasskeyUsed();
			completeSignIn();
		} catch (err) {
			// Aborted (button, password form, leaving the page), or a browser
			// that can't offer passkeys in autofill here: nothing to say.
			// Autofill is a quiet extra; only a refusal from the server shows.
			const status = (err as { status?: number } | null)?.status ?? 0;
			if (!ctrl.signal.aborted && !passkeyCancelled(err) && status > 0) {
				passkeyNotice = passkeyMessage(err, 'sign-in');
			}
		} finally {
			loading = false;
			if (autofill === ctrl) autofill = null;
		}
	}

	/** What to tell the person after a passkey attempt that didn't sign in. */
	function passkeyMessage(err: unknown, step: 'sign-in' | 'two-step'): { text: string; tone: 'muted' | 'warn' } {
		if (passkeyCancelled(err)) {
			return {
				text: i18n.t(step === 'two-step' ? 'ADMIN_NEXT.LOGIN.PASSKEY_CANCELLED_TWO_STEP' : 'ADMIN_NEXT.LOGIN.PASSKEY_CANCELLED'),
				tone: 'muted',
			};
		}
		const status = (err as { status?: number })?.status ?? 0;
		if (status === 401) {
			return {
				text: i18n.t(step === 'two-step' ? 'ADMIN_NEXT.LOGIN.PASSKEY_NOT_THIS_ACCOUNT' : 'ADMIN_NEXT.LOGIN.PASSKEY_SIGN_IN_FAILED'),
				tone: 'warn',
			};
		}
		if (status === 429) return { text: i18n.t('ADMIN_NEXT.LOGIN.PASSKEY_TOO_MANY_TRIES'), tone: 'warn' };
		if (status === 403) return { text: i18n.t('ADMIN_NEXT.LOGIN.PASSKEY_OFF'), tone: 'warn' };
		return { text: i18n.t('ADMIN_NEXT.LOGIN.PASSKEY_FAILED'), tone: 'warn' };
	}

	/** The "Sign in with a passkey" button: a passkey alone, no password. */
	async function signInWithPasskey() {
		stopAutofill();
		passkeyNotice = null;
		passkeyBusy = true;
		try {
			auth.setServer(serverUrl, environment);
			const start = await startPasskeySignIn('sign-in');
			const credential = await getPasskey(start.options);
			await finishPasskeySignIn('sign-in', start.ticket, credential);
			rememberPasskeyUsed();
			completeSignIn();
			return;
		} catch (err) {
			passkeyNotice = passkeyMessage(err, 'sign-in');
		} finally {
			passkeyBusy = false;
		}
		startAutofill();
	}

	// When the 2FA stage opens (after a password, or resumed from SSO), ask
	// for the account's passkeys. Any at all → offer "Use your passkey instead".
	$effect(() => {
		if (stage !== '2fa' || !challengeToken || !showPasskey) return;
		if (twoStepFor === challengeToken) return;
		const token = challengeToken;
		twoStepFor = token;
		startPasskeySignIn('two-step', token)
			.then((start) => {
				if (stage !== '2fa' || challengeToken !== token) return;
				twoStepStart = start;
				twoStepFetchedAt = Date.now();
				twoStepOffered = (start.options.allowCredentials?.length ?? 0) > 0;
			})
			.catch(() => { /* no button; the code still works */ });
	});

	async function useTwoStepPasskey() {
		passkeyNotice = null;
		passkeyBusy = true;
		try {
			let start = twoStepStart;
			if (!start || Date.now() - twoStepFetchedAt > TICKET_REUSE_MS) {
				start = await startPasskeySignIn('two-step', challengeToken);
				twoStepStart = start;
				twoStepFetchedAt = Date.now();
			}
			const credential = await getPasskey(start.options);
			// The ticket is spent once an answer goes back, right or wrong.
			twoStepStart = null;
			await finishPasskeySignIn('two-step', start.ticket, credential, challengeToken);
			rememberPasskeyUsed();
			completeSignIn();
		} catch (err) {
			passkeyNotice = passkeyMessage(err, 'two-step');
		} finally {
			passkeyBusy = false;
		}
	}

	function resetTwoStep() {
		twoStepStart = null;
		twoStepFetchedAt = 0;
		twoStepFor = '';
		twoStepOffered = false;
		passkeyNotice = null;
	}

	// Resume an SSO login that came back needing 2FA: oauth-callback stashed the
	// challenge token and bounced here, so drop straight into the 2FA stage and
	// reuse the existing verify UI.
	onMount(() => {
		// Nobody is signed in here, so the look is the site's, not whoever used
		// this browser last: forget the boot cache and paint the site defaults.
		if (!auth.isAuthenticated) {
			clearBootCache();
			theme.paintSiteDefaults();
			prefs.paintSiteDefaults();
		}
		const pending = sessionStorage.getItem('grav_sso_2fa');
		if (pending) {
			sessionStorage.removeItem('grav_sso_2fa');
			challengeToken = pending;
			stage = '2fa';
			code = '';
			attempted = false;
		}
	});

	// The server sends a refused SSO sign-in back here with ?sso_error=. In the
	// sign-in-again popup, hand that to the dialog that opened it; otherwise say
	// so once the strings are in, and drop it from the address.
	let ssoRefused = $state(false);
	onMount(() => {
		if (!page.url.searchParams.get('sso_error')) return;
		if (reportSsoToOpener(null, true)) return;
		ssoRefused = true;
	});

	$effect(() => {
		if (!ssoRefused || !ready) return;
		ssoRefused = false;
		toast.error(i18n.t('ADMIN_NEXT.LOGIN.SSO_FAILED'));
		untrack(() => {
			const url = new URL(page.url);
			url.searchParams.delete('sso_error');
			replaceState(url, page.state);
		});
	});

	// Leave the SPA for the server's OAuth start endpoint (full-page navigation
	// — the provider round-trip can't run through the in-app router). Carry the
	// returnTo through so the callback drops the user back where they intended.
	function startSso(id: string) {
		auth.setServer(serverUrl, environment);
		const prefix = auth.apiPrefix || '/api/v1';
		const returnTo = page.url.searchParams.get('returnTo') || `${base}/`;
		window.location.href =
			`${auth.serverUrl}${prefix}/auth/sso/${encodeURIComponent(id)}/start` +
			`?returnTo=${encodeURIComponent(returnTo)}`;
	}

	function completeSignIn() {
		toast.success(i18n.t('ADMIN_NEXT.LOGIN.SIGNED_IN_SUCCESSFULLY'));
		const returnTo = page.url.searchParams.get('returnTo');
		goto(returnTo && returnTo !== `${base}/login` ? returnTo : `${base}/`);
	}

	function backToCredentials() {
		resetTwoStep();
		stage = 'credentials';
		challengeToken = '';
		code = '';
		codeInvalid = false;
		password = '';
	}

	async function handleLogin(e: Event) {
		e.preventDefault();
		attempted = true;

		if (!username.trim() || !password.trim()) {
			toast.error(i18n.t('ADMIN_NEXT.LOGIN.PLEASE_FILL_IN_ALL_REQUIRED_FIELDS'));
			return;
		}

		stopAutofill();
		passkeyNotice = null;
		loading = true;
		try {
			auth.setServer(serverUrl, environment);

			let captchaToken = '';
			try {
				captchaToken = (await captcha?.token()) ?? '';
			} catch (err) {
				toast.error(err instanceof Error ? err.message : i18n.t('ADMIN_NEXT.LOGIN.CAPTCHA_NOT_COMPLETED'));
				return;
			}

			const result = await login(username, password, captchaToken);
			if (result.requires2fa && result.challengeToken) {
				resetTwoStep();
				stage = '2fa';
				challengeToken = result.challengeToken;
				code = '';
				attempted = false;
				return;
			}
			completeSignIn();
			return;
		} catch (err: unknown) {
			if (err && typeof err === 'object' && 'status' in err) {
				const apiErr = err as { status: number; message: string };
				if (apiErr.status === 401) {
					toast.error(i18n.t('ADMIN_NEXT.LOGIN.INVALID_USERNAME_OR_PASSWORD'));
				} else if (apiErr.status === 429) {
					toast.error(apiErr.message || 'Too many login attempts. Try again later.');
				} else {
					toast.error(apiErr.message || 'Login failed');
				}
			} else {
				toast.error(i18n.t('ADMIN_NEXT.LOGIN.UNABLE_TO_CONNECT_TO_SERVER_CHECK_YOUR'));
			}
		} finally {
			loading = false;
			// The server consumes the captcha token on every attempt, right or
			// wrong, so the next try needs a freshly solved one.
			captcha?.reset();
		}
		// Still here after a refused password: offer autofill again.
		if (stage === 'credentials') startAutofill();
	}

	async function handleVerify(e: Event) {
		e.preventDefault();
		codeInvalid = false;

		if (!code.trim() || !/^\d{6}$/.test(code.trim())) {
			codeInvalid = true;
			return;
		}

		loading = true;
		try {
			await verify2fa(challengeToken, code.trim());
			completeSignIn();
		} catch (err: unknown) {
			if (err && typeof err === 'object' && 'status' in err) {
				const apiErr = err as { status: number; message: string };
				codeInvalid = true;
				if (apiErr.status === 429) {
					toast.error(apiErr.message || 'Too many attempts. Try again later.');
				} else if (apiErr.status === 401) {
					toast.error(apiErr.message || 'Invalid 2FA code');
				} else {
					toast.error(apiErr.message || 'Verification failed');
				}
			} else {
				toast.error(i18n.t('ADMIN_NEXT.LOGIN.UNABLE_TO_VERIFY_CODE_CHECK_YOUR'));
			}
		} finally {
			loading = false;
		}
	}
</script>

{#snippet passkeyNoticeLine(notice: { text: string; tone: 'muted' | 'warn' })}
	<p
		class="mt-2 text-center text-[0.75rem] {notice.tone === 'warn' ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}"
		role="status"
		data-testid="passkey-notice"
	>
		{notice.text}
	</p>
{/snippet}

<svelte:window ononline={retryProbe} onfocus={retryProbe} />

<svelte:head>
	<title>{i18n.t('ADMIN_NEXT.LOGIN.LOGIN_GRAV_ADMIN')}</title>
</svelte:head>

{#if !ready}
	<div class="min-h-screen bg-background" aria-busy="true"></div>
{:else}
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
			<!-- Brand -->
			<div class="mb-8 flex flex-col items-center text-center">
				<div class="mb-4">
					<BrandLogo size="login" />
				</div>
				<h1 class={logoNamesSite ? 'sr-only' : 'text-2xl font-semibold tracking-tight text-foreground'}>{branding.title || i18n.t('ADMIN_NEXT.LOGIN.GRAV_ADMIN')}</h1>
				<p class="mt-1 text-[0.8125rem] text-muted-foreground">
					{#if stage === '2fa'}
						{i18n.t('ADMIN_NEXT.LOGIN.TWOFA_SUBTITLE')}
					{:else}
						{branding.subtitle || i18n.t('ADMIN_NEXT.LOGIN.SUBTITLE')}
					{/if}
				</p>
			</div>

			<!-- Login Card -->
			<div class="rounded-lg border border-border bg-card shadow-sm">
				{#if stage === 'credentials'}
					<!-- Server config (collapsible) -->
					<div class="border-b border-border px-6 py-3">
						<button
							type="button"
							class="flex w-full items-center gap-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground"
							onclick={() => showServerConfig = !showServerConfig}
						>
							<Server size={13} />
							{i18n.t('ADMIN_NEXT.LOGIN.SERVER_CONFIGURATION')}
							<ChevronDown size={13} class="ms-auto transition-transform {showServerConfig ? 'rotate-180' : ''}" />
						</button>

						{#if showServerConfig}
							<div class="mt-3 space-y-3 pb-1">
								<div class="space-y-1.5">
									<label for="server-url" class="text-[0.8125rem] font-medium text-foreground">{i18n.t('ADMIN_NEXT.LOGIN.SERVER_URL')}</label>
									<div class="flex rounded-md shadow-sm">
										<span class="inline-flex items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-muted-foreground">
											<Globe size={13} />
										</span>
										<input
											id="server-url"
											type="url"
											class="flex h-9 w-full rounded-r-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
											bind:value={serverUrl}
											onchange={serverFieldsChanged}
										/>
									</div>
								</div>

								<div class="space-y-1.5">
									<label for="environment" class="text-[0.8125rem] font-medium text-foreground">{i18n.t('ADMIN_NEXT.LOGIN.ENVIRONMENT')}</label>
									<input
										id="environment"
										type="text"
										class="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
										bind:value={environment}
										onchange={serverFieldsChanged}
									/>
								</div>
							</div>
						{/if}
					</div>

					{#if showPasskey}
						<!-- A passkey alone: no username or password. -->
						<div class="px-6 pt-5">
							<Button
								type="button"
								variant={passkeyLeads ? 'default' : 'outline'}
								class="w-full"
								disabled={loading || passkeyBusy}
								onclick={signInWithPasskey}
								data-testid="passkey-signin"
							>
								{#if passkeyBusy}
									<Loader2 size={15} class="animate-spin" />
									{i18n.t('ADMIN_NEXT.LOGIN.PASSKEY_WAITING')}
								{:else}
									<KeyRound size={15} />
									{i18n.t('ADMIN_NEXT.LOGIN.PASSKEY_SIGN_IN')}
								{/if}
							</Button>
							{#if passkeyNotice}
								{@render passkeyNoticeLine(passkeyNotice)}
							{/if}
							<div class="relative mt-4 flex items-center">
								<div class="flex-grow border-t border-border"></div>
								<span class="mx-3 text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
									{i18n.t('ADMIN_NEXT.LOGIN.PASSKEY_OR')}
								</span>
								<div class="flex-grow border-t border-border"></div>
							</div>
						</div>
					{/if}

					<!-- Credentials form -->
					{#if showPasswordForm}
						<form onsubmit={handleLogin} class="space-y-4 px-6 {showPasskey ? 'pt-4 pb-5' : 'py-5'}">
							<div class="space-y-1.5">
								<label for="username" class="text-[0.8125rem] font-medium text-foreground">{i18n.t('ADMIN_NEXT.USERNAME')}</label>
								<input
									id="username"
									type="text"
									class="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring
										{usernameInvalid
											? 'border-red-500 ring-1 ring-red-500/30 animate-[shake_0.3s_ease-in-out]'
											: 'border-input'}"
									bind:value={username}
									autocomplete={showPasskey ? 'username webauthn' : 'username'}
									disabled={loading}
								/>
								{#if usernameInvalid}
									<p class="text-xs text-red-500">{i18n.t('ADMIN_NEXT.LOGIN.USERNAME_IS_REQUIRED')}</p>
								{/if}
							</div>

							<div class="space-y-1.5">
								<label for="password" class="text-[0.8125rem] font-medium text-foreground">{i18n.t('ADMIN_NEXT.PASSWORD')}</label>
								<input
									id="password"
									type="password"
									class="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring
										{passwordInvalid
											? 'border-red-500 ring-1 ring-red-500/30 animate-[shake_0.3s_ease-in-out]'
											: 'border-input'}"
									bind:value={password}
									autocomplete="current-password"
									disabled={loading}
								/>
								{#if passwordInvalid}
									<p class="text-xs text-red-500">{i18n.t('ADMIN_NEXT.LOGIN.PASSWORD_IS_REQUIRED')}</p>
								{/if}
								<div class="pt-0.5 text-end">
									<a
										href="{base}/forgot"
										class="text-[0.75rem] font-medium text-muted-foreground transition-colors hover:text-foreground"
									>
										{i18n.t('ADMIN_NEXT.LOGIN.FORGOT_PASSWORD')}
									</a>
								</div>
							</div>

							<LoginCaptcha
								bind:this={captcha}
								bind:ready={captchaReady}
								config={captchaConfig}
								flow={captchaConfig.flows.login}
							/>

							<Button
								type="submit"
								variant={showPasskey && passkeyLeads ? 'outline' : 'default'}
								class="w-full"
								disabled={loading || passkeyBusy || !captchaReady}
							>
								{#if loading}
									<Loader2 size={15} class="animate-spin" />
									{i18n.t('ADMIN_NEXT.LOGIN.SIGNING_IN')}
								{:else}
									<LogIn size={15} />
									{i18n.t('ADMIN_NEXT.LOGIN.SIGN_IN')}
								{/if}
							</Button>
						</form>
					{/if}

					{#if providers.length > 0}
						<!-- Without the form, the buttons sit as close under the passkey divider as the form would. -->
						<div class="px-6 pb-5 {showPasswordForm ? '' : showPasskey ? 'pt-4' : 'pt-5'}">
							{#if showPasswordForm}
								<div class="relative mb-4 flex items-center">
									<div class="flex-grow border-t border-border"></div>
									<span class="mx-3 text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
										{i18n.t('ADMIN_NEXT.LOGIN.OR_CONTINUE_WITH')}
									</span>
									<div class="flex-grow border-t border-border"></div>
								</div>
							{/if}
							<div class="space-y-2">
								{#each providers as provider (provider.id)}
									<Button
										type="button"
										variant="outline"
										class="w-full"
										disabled={loading}
										onclick={() => startSso(provider.id)}
									>
										{i18n.t('ADMIN_NEXT.LOGIN.CONTINUE_WITH', { provider: provider.label })}
									</Button>
								{/each}
							</div>
						</div>
					{/if}
				{:else}
					<!-- 2FA challenge form -->
					<form onsubmit={handleVerify} class="space-y-4 px-6 py-5">
						<div class="flex items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-2.5">
							<ShieldCheck size={16} class="shrink-0 text-muted-foreground" />
							<p class="text-[0.75rem] text-muted-foreground">
								{@html i18n.tHtml('ADMIN_NEXT.LOGIN.AUTH_CODE_PROMPT', { username })}
							</p>
						</div>

						<div class="space-y-1.5">
							<label for="twofa-code" class="text-[0.8125rem] font-medium text-foreground">{i18n.t('ADMIN_NEXT.LOGIN.AUTHENTICATION_CODE')}</label>
							<input
								id="twofa-code"
								type="text"
								inputmode="numeric"
								pattern="[0-9]*"
								maxlength="6"
								autocomplete="one-time-code"
								class="flex h-10 w-full rounded-md border bg-transparent px-3 py-1 text-center font-mono text-lg tracking-[0.4em] shadow-sm transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring
									{codeInvalid
										? 'border-red-500 ring-1 ring-red-500/30 animate-[shake_0.3s_ease-in-out]'
										: 'border-input'}"
								bind:value={code}
								disabled={loading}
								placeholder="000000"
							/>
							{#if codeInvalid}
								<p class="text-xs text-red-500">{i18n.t('ADMIN_NEXT.LOGIN.ENTER_A_VALID_6_DIGIT_CODE')}</p>
							{/if}
						</div>

						<Button type="submit" class="w-full" disabled={loading || passkeyBusy}>
							{#if loading}
								<Loader2 size={15} class="animate-spin" />
								{i18n.t('ADMIN_NEXT.LOGIN.VERIFYING')}
							{:else}
								<ShieldCheck size={15} />
								{i18n.t('ADMIN_NEXT.LOGIN.VERIFY')}
							{/if}
						</Button>

						{#if showPasskey && twoStepOffered}
							<!-- A passkey in place of the code; it counts as both steps. -->
							<div>
								<Button
									type="button"
									variant="outline"
									class="w-full"
									disabled={loading || passkeyBusy}
									onclick={useTwoStepPasskey}
									data-testid="passkey-two-step"
								>
									{#if passkeyBusy}
										<Loader2 size={15} class="animate-spin" />
										{i18n.t('ADMIN_NEXT.LOGIN.PASSKEY_WAITING')}
									{:else}
										<KeyRound size={15} />
										{i18n.t('ADMIN_NEXT.LOGIN.PASSKEY_USE_INSTEAD')}
									{/if}
								</Button>
								{#if passkeyNotice}
									{@render passkeyNoticeLine(passkeyNotice)}
								{/if}
							</div>
						{/if}

						<button
							type="button"
							onclick={backToCredentials}
							class="flex w-full items-center justify-center gap-1.5 text-[0.75rem] font-medium text-muted-foreground transition-colors hover:text-foreground"
							disabled={loading}
						>
							<DirectionalIcon name="arrow-back" size={12} />
							{i18n.t('ADMIN_NEXT.LOGIN.BACK_TO_SIGN_IN')}
						</button>
					</form>
				{/if}
			</div>

			{#if branding.showPoweredBy}
				<p class="mt-6 text-center text-xs text-muted-foreground">
					{i18n.t('ADMIN_NEXT.LOGIN.POWERED_BY_GRAV_CMS')}
				</p>
			{/if}
		</div>
	</div>
{/if}
