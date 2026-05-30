<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import { validateInvite, acceptInvite } from '$lib/api/auth';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Sun, Moon, UserPlus, Loader2 } from 'lucide-svelte';
	import DirectionalIcon from '$lib/components/ui/DirectionalIcon.svelte';
	import { theme } from '$lib/stores/theme.svelte';
	import BrandLogo from '$lib/components/ui/BrandLogo.svelte';
	import PasswordField from '$lib/components/ui/PasswordField.svelte';
	import { passwordPolicy } from '$lib/stores/passwordPolicy.svelte';
	import { evaluatePassword } from '$lib/utils/passwordStrength';

	const token = $derived(page.url.searchParams.get('token') ?? '');

	let validating = $state(true);
	let valid = $state(false);
	let expired = $state(false);
	let email = $state('');

	let username = $state('');
	let fullname = $state('');
	let title = $state('');
	let password = $state('');
	let confirmPassword = $state('');

	let loading = $state(false);
	let usernameInvalid = $state(false);
	let passwordInvalid = $state(false);
	let confirmInvalid = $state(false);

	$effect(() => {
		passwordPolicy.load().catch(() => {});
	});

	$effect(() => {
		void load(token);
	});

	let loadedToken = '';
	async function load(t: string) {
		if (!t || t === loadedToken) return;
		loadedToken = t;
		validating = true;
		try {
			const res = await validateInvite(t);
			valid = res.valid;
			expired = res.expired;
			email = res.email;
			if (res.fullname) fullname = res.fullname;
		} catch {
			valid = false;
			expired = false;
		} finally {
			validating = false;
		}
	}

	const usernameValid = $derived(username.trim().length >= 3 && username.trim().length <= 64);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		usernameInvalid = false;
		passwordInvalid = false;
		confirmInvalid = false;

		if (!usernameValid) {
			usernameInvalid = true;
			return;
		}
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
			await acceptInvite(token, {
				username: username.trim(),
				password,
				fullname: fullname || undefined,
				title: title || undefined,
			});
			toast.success(i18n.t('ADMIN_NEXT.INVITATIONS.ACCEPT_SUCCESS'));
			goto(base || '/');
		} catch (err: unknown) {
			if (err && typeof err === 'object' && 'status' in err) {
				const apiErr = err as { status: number; message: string };
				if (apiErr.status === 409) {
					usernameInvalid = true;
					toast.error(apiErr.message || i18n.t('ADMIN_NEXT.INVITATIONS.USERNAME_TAKEN'));
				} else if (apiErr.status === 410) {
					expired = true;
					valid = false;
					toast.error(apiErr.message || i18n.t('ADMIN_NEXT.INVITATIONS.EXPIRED'));
				} else {
					toast.error(apiErr.message || i18n.t('ADMIN_NEXT.INVITATIONS.ACCEPT_FAILED'));
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
	<title>{i18n.t('ADMIN_NEXT.INVITATIONS.ACCEPT_TITLE')}</title>
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
			<h1 class="text-2xl font-semibold tracking-tight text-foreground">{i18n.t('ADMIN_NEXT.INVITATIONS.ACCEPT_HEADING')}</h1>
			<p class="mt-1 text-[0.8125rem] text-muted-foreground">
				{#if validating}
					{i18n.t('ADMIN_NEXT.INVITATIONS.CHECKING_INVITE')}
				{:else if !token || (!valid && !expired)}
					{i18n.t('ADMIN_NEXT.INVITATIONS.INVALID_INVITE')}
				{:else if expired}
					{i18n.t('ADMIN_NEXT.INVITATIONS.EXPIRED_INVITE')}
				{:else}
					{i18n.t('ADMIN_NEXT.INVITATIONS.ACCEPT_SUBHEADING')}
				{/if}
			</p>
		</div>

		<div class="rounded-lg border border-border bg-card shadow-sm">
			{#if validating}
				<div class="flex items-center justify-center px-6 py-8">
					<Loader2 size={20} class="animate-spin text-muted-foreground" />
				</div>
			{:else if !token || (!valid && !expired)}
				<div class="px-6 py-5 text-center text-[0.8125rem] text-muted-foreground">
					{i18n.t('ADMIN_NEXT.INVITATIONS.INVALID_INVITE_BODY')}
				</div>
			{:else if expired}
				<div class="px-6 py-5 text-center text-[0.8125rem] text-muted-foreground">
					{i18n.t('ADMIN_NEXT.INVITATIONS.EXPIRED_INVITE_BODY')}
				</div>
			{:else}
				<form onsubmit={handleSubmit} class="space-y-4 px-6 py-5" novalidate>
					<div class="space-y-1.5">
						<label for="email" class="text-[0.8125rem] font-medium text-foreground">{i18n.t('ADMIN_NEXT.INVITATIONS.EMAIL')}</label>
						<input
							id="email"
							type="email"
							value={email}
							readonly
							class="flex h-9 w-full rounded-md border border-input bg-muted/40 px-3 py-1 text-sm text-muted-foreground shadow-sm focus-visible:outline-none"
						/>
					</div>

					<div class="space-y-1.5">
						<label for="username" class="text-[0.8125rem] font-medium text-foreground">{i18n.t('ADMIN_NEXT.USERNAME')}</label>
						<input
							id="username"
							type="text"
							autocomplete="username"
							placeholder={i18n.t('ADMIN_NEXT.USERS.NEW.LOWERCASE_3_64_CHARS')}
							bind:value={username}
							disabled={loading}
							class="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring
								{usernameInvalid ? 'border-red-500 ring-1 ring-red-500/30' : 'border-input'}"
						/>
						{#if usernameInvalid}
							<p class="text-xs text-red-500">{i18n.t('ADMIN_NEXT.INVITATIONS.USERNAME_INVALID')}</p>
						{/if}
					</div>

					<div class="space-y-1.5">
						<label for="fullname" class="text-[0.8125rem] font-medium text-foreground">{i18n.t('ADMIN_NEXT.USERS.NEW.FULL_NAME')}</label>
						<input
							id="fullname"
							type="text"
							autocomplete="name"
							bind:value={fullname}
							disabled={loading}
							class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
						/>
					</div>

					<div class="space-y-1.5">
						<label for="title" class="text-[0.8125rem] font-medium text-foreground">{i18n.t('ADMIN_NEXT.INVITATIONS.TITLE_OPTIONAL')}</label>
						<input
							id="title"
							type="text"
							bind:value={title}
							disabled={loading}
							class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
						/>
					</div>

					<PasswordField
						id="password"
						label={i18n.t('ADMIN_NEXT.INVITATIONS.CHOOSE_PASSWORD')}
						bind:value={password}
						policy={passwordPolicy.current}
						disabled={loading}
						invalid={passwordInvalid}
						invalidMessage={i18n.t('ADMIN_NEXT.INVITATIONS.PASSWORD_POLICY')}
					/>

					<div class="space-y-1.5">
						<label for="confirm" class="text-[0.8125rem] font-medium text-foreground">{i18n.t('ADMIN_NEXT.RESET.CONFIRM_PASSWORD')}</label>
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
							{i18n.t('ADMIN_NEXT.INVITATIONS.CREATING_ACCOUNT')}
						{:else}
							<UserPlus size={15} />
							{i18n.t('ADMIN_NEXT.INVITATIONS.CREATE_ACCOUNT')}
						{/if}
					</Button>
				</form>
			{/if}

			<div class="border-t border-border px-6 py-3">
				<a
					href="{base}/login"
					class="flex items-center justify-center gap-1.5 text-[0.75rem] font-medium text-muted-foreground transition-colors hover:text-foreground"
				>
					<DirectionalIcon name="arrow-back" size={12} />
					{i18n.t('ADMIN_NEXT.RESET.BACK_TO_SIGN_IN')}
				</a>
			</div>
		</div>
	</div>
</div>
