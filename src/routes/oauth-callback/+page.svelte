<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { exchangeSsoCode } from '$lib/api/auth';
	import { toast } from 'svelte-sonner';
	import { Loader2 } from 'lucide-svelte';

	// Only honor an in-app return path; never an absolute URL (open-redirect guard).
	// A leading single slash is not enough on its own: the URL parser reads a
	// backslash as a slash for http(s) URLs and strips tab, LF and CR before
	// parsing, so `/\evil.com` and "/\t/evil.com" resolve off-site. Mirrors the
	// server-side check in SsoController::sanitizeReturnTo (GHSA-x72c-4jc4-8rh6).
	// SvelteKit's goto() refuses a cross-origin URL as well, so this is the second
	// of three layers rather than the only one.
	function safeReturnTo(): string {
		const rt = page.url.searchParams.get('returnTo');
		const inApp =
			!!rt && rt.startsWith('/') && !rt.startsWith('//') && !/[\u0000-\u001F\u007F\\]/.test(rt);
		return inApp ? (rt as string) : `${base}/`;
	}

	function bailToLogin() {
		toast.error(i18n.t('ADMIN_NEXT.LOGIN.SSO_FAILED'));
		goto(`${base}/login`);
	}

	/**
	 * Hand the result back to an opener and close, when this callback is running
	 * inside a popup. The reauth modal opens SSO that way rather than navigating,
	 * because a full-page redirect would destroy the SPA state and the queued
	 * requests that the modal exists to preserve.
	 *
	 * The popup does not exchange the code itself: it has its own copy of the
	 * auth store, so a session finalized here would be written to storage the
	 * opener never re-reads. Post the one-time code instead and let the opener
	 * exchange it. The code is single-use and expires in 120s, so it is safe to
	 * pass across a window boundary that we pin to our own origin.
	 */
	function reportToOpener(code: string | null, failed: boolean): boolean {
		const opener = window.opener;
		if (!opener || opener === window) return false;

		try {
			opener.postMessage(
				{ type: 'grav:sso', code: code ?? null, error: failed },
				window.location.origin,
			);
		} catch {
			return false;
		}

		window.close();
		return true;
	}

	onMount(async () => {
		const params = page.url.searchParams;
		const returnTo = safeReturnTo();
		const ssoError = Boolean(params.get('sso_error'));

		if (reportToOpener(params.get('code'), ssoError)) return;

		if (ssoError) {
			bailToLogin();
			return;
		}

		const code = params.get('code');
		if (!code) {
			goto(`${base}/login`);
			return;
		}

		try {
			const result = await exchangeSsoCode(code);
			if (result.requires2fa && result.challengeToken) {
				// Hand the challenge to the login page's existing 2FA stage.
				sessionStorage.setItem('grav_sso_2fa', result.challengeToken);
				goto(`${base}/login?returnTo=${encodeURIComponent(returnTo)}`);
				return;
			}
			toast.success(i18n.t('ADMIN_NEXT.LOGIN.SIGNED_IN_SUCCESSFULLY'));
			goto(returnTo);
		} catch {
			bailToLogin();
		}
	});
</script>

<svelte:head>
	<title>{i18n.t('ADMIN_NEXT.LOGIN.LOGIN_GRAV_ADMIN')}</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-background p-4">
	<div class="flex items-center gap-3 text-muted-foreground">
		<Loader2 size={18} class="animate-spin" />
		<span class="text-sm">{i18n.t('ADMIN_NEXT.LOGIN.SIGNING_IN')}</span>
	</div>
</div>
