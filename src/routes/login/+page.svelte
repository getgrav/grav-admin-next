<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { auth } from '$lib/stores/auth.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { login } from '$lib/api/auth';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Sun, Moon, LogIn, Server, Globe, ChevronDown, Loader2 } from 'lucide-svelte';
	import { theme } from '$lib/stores/theme.svelte';
	import BrandLogo from '$lib/components/ui/BrandLogo.svelte';

	const defaultUrl = import.meta.env.DEV ? 'http://localhost:5180/grav-api' : 'https://localhost/grav-api';
	let serverUrl = $state(auth.serverUrl || defaultUrl);
	let environment = $state(auth.environment || 'localhost');
	let username = $state('');
	let password = $state('');
	let loading = $state(false);
	let showServerConfig = $state(!auth.serverUrl && !auth.hasGravConfig);
	let attempted = $state(false);

	// Field-level validation state
	const usernameInvalid = $derived(attempted && !username.trim());
	const passwordInvalid = $derived(attempted && !password.trim());

	// Load translations on mount
	$effect(() => {
		if (!i18n.loaded) {
			auth.setServer(serverUrl, environment);
			i18n.loadPrefix('PLUGIN_LOGIN').then(() => {
				i18n.loadAllInBackground();
			});
		}
	});

	async function handleLogin(e: Event) {
		e.preventDefault();
		attempted = true;

		if (!username.trim() || !password.trim()) {
			toast.error('Please fill in all required fields');
			return;
		}

		loading = true;

		try {
			auth.setServer(serverUrl, environment);
			await login(username, password);
			toast.success('Signed in successfully');
			goto(`${base}/`);
		} catch (err: unknown) {
			if (err && typeof err === 'object' && 'status' in err) {
				const apiErr = err as { status: number; message: string };
				if (apiErr.status === 401) {
					toast.error('Invalid username or password');
				} else {
					toast.error(apiErr.message || 'Login failed');
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
	<title>Login — Grav Admin</title>
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
		<!-- Brand -->
		<div class="mb-8 flex flex-col items-center text-center">
			<div class="mb-4">
				<BrandLogo size="login" />
			</div>
			<h1 class="text-2xl font-semibold tracking-tight text-foreground">Grav Admin</h1>
			<p class="mt-1 text-[13px] text-muted-foreground">Sign in to manage your site</p>
		</div>

		<!-- Login Card -->
		<div class="rounded-lg border border-border bg-card shadow-sm">
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
								class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
								bind:value={environment}
							/>
						</div>
					</div>
				{/if}
			</div>

			<!-- Login form -->
			<form onsubmit={handleLogin} class="space-y-4 px-6 py-5">
				<div class="space-y-1.5">
					<label for="username" class="text-[13px] font-medium text-foreground">Username</label>
					<input
						id="username"
						type="text"
						class="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring
							{usernameInvalid
								? 'border-red-500 ring-1 ring-red-500/30 animate-[shake_0.3s_ease-in-out]'
								: 'border-input'}"
						bind:value={username}
						autocomplete="username"
						disabled={loading}
					/>
					{#if usernameInvalid}
						<p class="text-xs text-red-500">Username is required</p>
					{/if}
				</div>

				<div class="space-y-1.5">
					<label for="password" class="text-[13px] font-medium text-foreground">Password</label>
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
						<p class="text-xs text-red-500">Password is required</p>
					{/if}
				</div>

				<Button type="submit" class="w-full" disabled={loading}>
					{#if loading}
						<Loader2 size={15} class="animate-spin" />
						Signing in...
					{:else}
						<LogIn size={15} />
						Sign In
					{/if}
				</Button>
			</form>
		</div>

		<p class="mt-6 text-center text-xs text-muted-foreground">
			Powered by Grav CMS
		</p>
	</div>
</div>
