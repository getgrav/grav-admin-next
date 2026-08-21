<script lang="ts">
	/**
	 * The captcha challenge on the unauthenticated forms (login, forgotten
	 * password, first-run setup). Which challenge — if any — comes from the
	 * server via GET /auth/captcha; this component renders it and hands back a
	 * solved token for the request body.
	 *
	 * Tokens are single use: the API consumes one on every attempt, including a
	 * failed one, so the caller must reset() after each submit.
	 *
	 * Usage:
	 *   <LoginCaptcha bind:this={captcha} bind:ready={captchaReady} {config} />
	 *   const token = await captcha.token();   // '' when captcha is off
	 *   captcha.reset();                       // after every submit
	 */
	import { Loader2, ShieldAlert, ShieldCheck } from 'lucide-svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import type { CaptchaConfig } from '$lib/api/auth';

	let {
		config,
		flow = true,
		ready = $bindable(false),
	}: {
		config: CaptchaConfig;
		/** Whether this particular form is gated. Off means render nothing. */
		flow?: boolean;
		/** True once a token is available (or will be, without user action). */
		ready?: boolean;
	} = $props();

	type Status = 'off' | 'loading' | 'waiting' | 'solved' | 'error';

	let status = $state<Status>('off');
	let container = $state<HTMLDivElement | null>(null);

	/** How long token() waits for a challenge already in flight. */
	const TOKEN_TIMEOUT_MS = 30_000;

	let solved = '';
	let resolveToken: ((token: string) => void) | null = null;
	let tokenPromise: Promise<string> = new Promise((resolve) => (resolveToken = resolve));
	let capInstance: { solve: () => Promise<{ token: string }>; reset: () => void } | null = null;
	let recaptchaWidgetId: number | null = null;

	const active = $derived(config.enabled && flow && Boolean(config.provider));
	const isRecaptchaV3 = $derived(config.provider === 'recaptcha' && config.version.startsWith('3'));
	// Invisible challenges solve themselves, so the form stays submittable while
	// they work — token() waits. A checkbox the user hasn't ticked does not.
	const selfSolving = $derived(config.mode === 'invisible' || isRecaptchaV3);

	$effect(() => {
		ready = !active || status === 'solved' || (selfSolving && status !== 'error');
	});

	function deliver(token: string): void {
		solved = token;
		status = 'solved';
		resolveToken?.(token);
	}

	function rearm(): void {
		solved = '';
		tokenPromise = new Promise((resolve) => (resolveToken = resolve));
	}

	/**
	 * Hand back a solved token for the request body. Empty string when captcha
	 * is off or this form isn't gated, so callers can call it unconditionally.
	 */
	export async function token(): Promise<string> {
		if (!active) return '';
		if (solved) return solved;

		if (status === 'error') {
			throw new Error(i18n.t('ADMIN_NEXT.LOGIN.CAPTCHA_FAILED_TO_LOAD'));
		}

		// reCAPTCHA v3 has no widget and no waiting — it mints on demand.
		if (isRecaptchaV3) {
			const grecaptcha = (window as any).grecaptcha;
			const fresh = await grecaptcha.execute(config.siteKey, { action: 'login' });
			deliver(fresh);
			return fresh;
		}

		const timeout = new Promise<never>((_, reject) =>
			setTimeout(() => reject(new Error(i18n.t('ADMIN_NEXT.LOGIN.CAPTCHA_NOT_COMPLETED'))), TOKEN_TIMEOUT_MS),
		);

		return Promise.race([tokenPromise, timeout]);
	}

	/**
	 * Arm a fresh challenge. Must be called after every submit — the server
	 * consumes the token whether the credentials were right or wrong, so a
	 * second attempt with the same one is rejected as a replay.
	 */
	export function reset(): void {
		if (!active) return;

		rearm();
		status = 'waiting';

		if (config.provider === 'cap') {
			capInstance?.reset();
			void solveCap();
			return;
		}

		if (config.provider === 'turnstile') {
			(window as any).turnstile?.reset();
			return;
		}

		if (config.provider === 'recaptcha' && recaptchaWidgetId !== null) {
			(window as any).grecaptcha?.reset(recaptchaWidgetId);
		}
	}

	/** Load a third-party widget script once, reusing the in-flight promise. */
	const scripts = new Map<string, Promise<void>>();

	function loadScript(src: string): Promise<void> {
		const existing = scripts.get(src);
		if (existing) return existing;

		const loading = new Promise<void>((resolve, reject) => {
			const el = document.createElement('script');
			el.src = src;
			el.async = true;
			el.defer = true;
			el.onload = () => resolve();
			el.onerror = () => reject(new Error(`Failed to load ${src}`));
			document.head.appendChild(el);
		});

		scripts.set(src, loading);
		return loading;
	}

	/** Wait for a widget script to publish its global. */
	async function waitFor(get: () => unknown, ms = 10_000): Promise<void> {
		const deadline = Date.now() + ms;
		while (!get()) {
			if (Date.now() > deadline) throw new Error('Captcha widget never became ready');
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
	}

	/**
	 * Base URL of the API's cap endpoints. Built from the SPA's own server
	 * config rather than the absolute URL the server reports, so a dev proxy or
	 * an alternate host stays same-origin — the same reasoning as startSso().
	 */
	function capEndpoint(): string {
		return `${auth.serverUrl}${auth.apiPrefix || '/api/v1'}/auth/captcha/`;
	}

	async function solveCap(): Promise<void> {
		if (!capInstance) return;

		try {
			const result = await capInstance.solve();
			deliver(result.token);
		} catch {
			status = 'error';
		}
	}

	async function setupCap(): Promise<void> {
		// The widget kicks off its wasm fetch at import time, defaulting to a
		// jsDelivr URL. Point it at the bundled binary FIRST or the admin makes
		// a third-party request on every visit to the login page.
		const { default: wasmUrl } = await import('@cap.js/wasm/browser/cap_wasm_bg.wasm?url');
		(window as any).CAP_CUSTOM_WASM_URL = wasmUrl;

		await import('@cap.js/widget');

		const Cap = (window as any).Cap;
		if (typeof Cap !== 'function') throw new Error('Cap widget did not register');

		if (config.mode === 'checkbox') {
			// Hand the widget our own element so it renders where we put it.
			const widget = document.createElement('cap-widget');
			container?.replaceChildren(widget);
			widget.addEventListener('solve', (event: Event) => {
				deliver((event as CustomEvent<{ token: string }>).detail.token);
			});
			widget.addEventListener('error', () => (status = 'error'));
			capInstance = new Cap({ apiEndpoint: capEndpoint() }, widget);
			status = 'waiting';
			return;
		}

		capInstance = new Cap({ apiEndpoint: capEndpoint() });
		status = 'waiting';
		await solveCap();
	}

	async function setupTurnstile(): Promise<void> {
		await loadScript('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit');
		await waitFor(() => (window as any).turnstile?.render);

		status = 'waiting';
		(window as any).turnstile.render(container, {
			sitekey: config.siteKey,
			// interaction-only keeps the widget out of the way until Cloudflare
			// decides this visitor needs to prove something.
			appearance: config.mode === 'checkbox' ? 'always' : 'interaction-only',
			callback: (value: string) => deliver(value),
			'error-callback': () => (status = 'error'),
			'expired-callback': () => {
				rearm();
				status = 'waiting';
			},
		});
	}

	async function setupRecaptcha(): Promise<void> {
		if (isRecaptchaV3) {
			await loadScript(
				`https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(config.siteKey)}`,
			);
			await waitFor(() => (window as any).grecaptcha?.execute);
			status = 'waiting';
			return;
		}

		await loadScript('https://www.google.com/recaptcha/api.js?render=explicit');
		await waitFor(() => (window as any).grecaptcha?.render);

		status = 'waiting';
		recaptchaWidgetId = (window as any).grecaptcha.render(container, {
			sitekey: config.siteKey,
			callback: (value: string) => deliver(value),
			'error-callback': () => (status = 'error'),
			'expired-callback': () => {
				rearm();
				status = 'waiting';
			},
		});
	}

	// Not onMount: the form renders before the server has said whether a captcha
	// is needed, so at mount time there is nothing to set up yet. Arm the widget
	// when the config arrives instead, once.
	let started = false;

	$effect(() => {
		if (!active || started) return;
		started = true;

		status = 'loading';

		const setup =
			config.provider === 'cap'
				? setupCap()
				: config.provider === 'turnstile'
					? setupTurnstile()
					: setupRecaptcha();

		setup.catch(() => (status = 'error'));
	});
</script>

{#if active}
	<div class="space-y-1.5">
		<!-- The third-party widgets render themselves into this element. -->
		<div bind:this={container}></div>

		{#if status === 'error'}
			<p class="flex items-center gap-1.5 text-xs text-red-500">
				<ShieldAlert size={13} />
				{i18n.t('ADMIN_NEXT.LOGIN.CAPTCHA_FAILED_TO_LOAD')}
			</p>
		{:else if selfSolving}
			<p class="flex items-center gap-1.5 text-[0.75rem] text-muted-foreground">
				{#if status === 'solved'}
					<ShieldCheck size={13} />
					{i18n.t('ADMIN_NEXT.LOGIN.CAPTCHA_VERIFIED')}
				{:else}
					<Loader2 size={13} class="animate-spin" />
					{i18n.t('ADMIN_NEXT.LOGIN.CAPTCHA_VERIFYING')}
				{/if}
			</p>
		{/if}
	</div>
{/if}

<style>
	/*
	 * The cap widget renders in a shadow root and exposes its palette as custom
	 * properties, which inherit through — so map them onto the admin's own theme
	 * tokens and it follows light/dark with everything else.
	 */
	:global(cap-widget) {
		--cap-background: var(--card);
		--cap-color: var(--foreground);
		--cap-border-color: var(--border);
		--cap-border-radius: 0.375rem;
		--cap-widget-width: 100%;
		--cap-checkbox-background: var(--background);
		--cap-checkbox-border: 1px solid var(--border);
		--cap-checkbox-border-radius: 0.25rem;
		--cap-spinner-color: var(--primary);
		--cap-spinner-background-color: var(--muted);
		--cap-font: inherit;
	}
</style>
