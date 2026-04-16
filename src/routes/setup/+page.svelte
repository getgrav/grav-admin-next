<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { auth } from '$lib/stores/auth.svelte';
	import { getSetupStatus, setupFirstUser } from '$lib/api/auth';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Sun, Moon, Server, Globe, ChevronDown, Loader2, UserPlus } from 'lucide-svelte';
	import { theme } from '$lib/stores/theme.svelte';
	import BrandLogo from '$lib/components/ui/BrandLogo.svelte';

	const defaultUrl = import.meta.env.DEV ? 'http://localhost:5180/grav-api' : 'https://localhost/grav-api';
	let serverUrl = $state(auth.serverUrl || defaultUrl);
	let environment = $state(auth.environment || 'localhost');
	let showServerConfig = $state(!auth.serverUrl && !auth.hasGravConfig);

	let username = $state('');
	let fullname = $state('');
	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');

	let loading = $state(false);
	let checking = $state(true);
	let attempted = $state(false);

	const usernameInvalid = $derived(attempted && !/^[a-z0-9_-]{3,64}$/i.test(username));
	const emailInvalid = $derived(attempted && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
	const passwordInvalid = $derived(attempted && password.length < 8);
	const confirmInvalid = $derived(attempted && password !== confirmPassword);

	// Guard: if setup is not actually required, bounce to login. This also
	// handles the case where setup was completed in another tab.
	$effect(() => {
		if (!auth.serverUrl) {
			auth.setServer(serverUrl, environment);
		}
		getSetupStatus()
			.then((required) => {
				if (!required) {
					goto(`${base}/login`);
					return;
				}
				checking = false;
			})
			.catch(() => {
				// Server unreachable — let the user fix server config and try again
				checking = false;
			});
	});

	async function handleSetup(e: Event) {
		e.preventDefault();
		attempted = true;

		if (usernameInvalid || emailInvalid || passwordInvalid || confirmInvalid) {
			toast.error('Please fix the errors above and try again');
			return;
		}

		loading = true;
		try {
			auth.setServer(serverUrl, environment);
			await setupFirstUser({
				username: username.trim(),
				password,
				email: email.trim(),
				fullname: fullname.trim() || undefined,
			});
			toast.success('Administrator account created — welcome to Grav');
			goto(`${base}/`);
		} catch (err: unknown) {
			if (err && typeof err === 'object' && 'status' in err) {
				const apiErr = err as { status: number; message: string };
				if (apiErr.status === 409) {
					toast.error('Setup has already been completed. Please sign in.');
					goto(`${base}/login`);
				} else if (apiErr.status === 429) {
					toast.error(apiErr.message || 'Too many attempts. Try again later.');
				} else if (apiErr.status === 422 || apiErr.status === 400) {
					toast.error(apiErr.message || 'Please check your input and try again.');
				} else {
					toast.error(apiErr.message || 'Could not complete setup');
				}
			} else {
				toast.error('Unable to connect to server. Check your server URL and try again.');
			}
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Setup — Grav Admin</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-background p-4">
	<button
		type="button"
		class="absolute top-4 right-4 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
		onclick={() => theme.toggleColorMode()}
		aria-label="Toggle dark mode"
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
			<h1 class="text-2xl font-semibold tracking-tight text-foreground">Welcome to Grav</h1>
			<p class="mt-1 text-[13px] text-muted-foreground">
				Create your administrator account to get started
			</p>
		</div>

		<div class="rounded-lg border border-border bg-card shadow-sm">
			{#if checking}
				<div class="flex items-center justify-center px-6 py-10 text-muted-foreground">
					<Loader2 size={16} class="animate-spin" />
					<span class="ml-2 text-[13px]">Checking server…</span>
				</div>
			{:else}
				<!-- Server config (collapsible) -->
				<div class="border-b border-border px-6 py-3">
					<button
						type="button"
						class="flex w-full items-center gap-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
						onclick={() => showServerConfig = !showServerConfig}
					>
						<Server size={13} />
						Server Configuration
						<ChevronDown size={13} class="ml-auto transition-transform {showServerConfig ? 'rotate-180' : ''}" />
					</button>

					{#if showServerConfig}
						<div class="mt-3 space-y-3 pb-1">
							<div class="space-y-1.5">
								<label for="server-url" class="text-[13px] font-medium text-foreground">Server URL</label>
								<div class="flex rounded-md shadow-sm">
									<span class="inline-flex items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-muted-foreground">
										<Globe size={13} />
									</span>
									<input
										id="server-url"
										type="url"
										class="flex h-9 w-full rounded-r-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
										bind:value={serverUrl}
									/>
								</div>
							</div>
							<div class="space-y-1.5">
								<label for="environment" class="text-[13px] font-medium text-foreground">Environment</label>
								<input
									id="environment"
									type="text"
									class="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
									bind:value={environment}
								/>
							</div>
						</div>
					{/if}
				</div>

				<form onsubmit={handleSetup} class="space-y-4 px-6 py-5">
					<div class="space-y-1.5">
						<label for="username" class="text-[13px] font-medium text-foreground">Username</label>
						<input
							id="username"
							type="text"
							class="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring
								{usernameInvalid ? 'border-red-500 ring-1 ring-red-500/30' : 'border-input'}"
							bind:value={username}
							autocomplete="username"
							disabled={loading}
						/>
						{#if usernameInvalid}
							<p class="text-xs text-red-500">3-64 characters: letters, numbers, hyphens, underscores</p>
						{/if}
					</div>

					<div class="space-y-1.5">
						<label for="fullname" class="text-[13px] font-medium text-foreground">Full name <span class="text-muted-foreground">(optional)</span></label>
						<input
							id="fullname"
							type="text"
							class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
							bind:value={fullname}
							autocomplete="name"
							disabled={loading}
						/>
					</div>

					<div class="space-y-1.5">
						<label for="email" class="text-[13px] font-medium text-foreground">Email</label>
						<input
							id="email"
							type="email"
							class="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring
								{emailInvalid ? 'border-red-500 ring-1 ring-red-500/30' : 'border-input'}"
							bind:value={email}
							autocomplete="email"
							disabled={loading}
						/>
						{#if emailInvalid}
							<p class="text-xs text-red-500">Enter a valid email address</p>
						{/if}
					</div>

					<div class="space-y-1.5">
						<label for="password" class="text-[13px] font-medium text-foreground">Password</label>
						<input
							id="password"
							type="password"
							class="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring
								{passwordInvalid ? 'border-red-500 ring-1 ring-red-500/30' : 'border-input'}"
							bind:value={password}
							autocomplete="new-password"
							disabled={loading}
						/>
						{#if passwordInvalid}
							<p class="text-xs text-red-500">Password must be at least 8 characters</p>
						{/if}
					</div>

					<div class="space-y-1.5">
						<label for="confirm" class="text-[13px] font-medium text-foreground">Confirm password</label>
						<input
							id="confirm"
							type="password"
							class="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring
								{confirmInvalid ? 'border-red-500 ring-1 ring-red-500/30' : 'border-input'}"
							bind:value={confirmPassword}
							autocomplete="new-password"
							disabled={loading}
						/>
						{#if confirmInvalid}
							<p class="text-xs text-red-500">Passwords do not match</p>
						{/if}
					</div>

					<Button type="submit" class="w-full" disabled={loading}>
						{#if loading}
							<Loader2 size={15} class="animate-spin" />
							Creating account...
						{:else}
							<UserPlus size={15} />
							Create administrator
						{/if}
					</Button>
				</form>
			{/if}
		</div>

		<p class="mt-6 text-center text-xs text-muted-foreground">
			Powered by Grav CMS
		</p>
	</div>
</div>
