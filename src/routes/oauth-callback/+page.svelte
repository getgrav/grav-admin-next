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

	onMount(async () => {
		const params = page.url.searchParams;
		const returnTo = safeReturnTo();

		if (params.get('sso_error')) {
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
