<script lang="ts">
	import { goto } from '$app/navigation';
	import { auth } from '$lib/stores/auth.svelte';
	import { login } from '$lib/api/auth';
	import { Sun, Moon, LogIn, Server, Globe } from 'lucide-svelte';
	import { theme } from '$lib/stores/theme.svelte';

	// In dev mode, use the Vite dev server (which proxies to Grav)
	const defaultUrl = import.meta.env.DEV ? 'http://localhost:5180/grav-api' : 'https://localhost/grav-api';
	let serverUrl = $state(auth.serverUrl || defaultUrl);
	let environment = $state(auth.environment || 'localhost');
	let username = $state('');
	let password = $state('');
	let error = $state('');
	let loading = $state(false);
	let showServerConfig = $state(!auth.serverUrl);

	async function handleLogin(e: Event) {
		e.preventDefault();
		error = '';
		loading = true;

		try {
			auth.setServer(serverUrl, environment);
			await login(username, password);
			goto('/');
		} catch (err: unknown) {
			if (err && typeof err === 'object' && 'status' in err) {
				const apiErr = err as { status: number; message: string };
				error = apiErr.status === 401
					? 'Invalid username or password'
					: apiErr.message || 'Login failed';
			} else {
				error = 'Unable to connect to server';
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
	<!-- Theme toggle -->
	<button
		type="button"
		class="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground absolute top-4 right-4"
		onclick={() => theme.toggleColorMode()}
		aria-label="Toggle dark mode"
	>
		{#if theme.isDark}
			<Sun size={18} />
		{:else}
			<Moon size={18} />
		{/if}
	</button>

	<div class="w-full max-w-md">
		<!-- Logo / Brand -->
		<div class="mb-8 text-center">
			<div class="bg-primary mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl shadow-lg">
				<span class="text-2xl font-bold text-white">G</span>
			</div>
			<h1 class="text-2xl font-semibold text-foreground">Grav Admin</h1>
			<p class="mt-1 text-sm text-muted-foreground">Sign in to manage your site</p>
		</div>

		<!-- Login Card -->
		<div class="space-y-6 rounded-xl border border-border bg-card p-8 shadow-xl">
			<!-- Server Configuration (collapsible) -->
			<div>
				<button
					type="button"
					class="flex w-full items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
					onclick={() => showServerConfig = !showServerConfig}
				>
					<Server size={14} />
					<span>Server Configuration</span>
					<span class="ml-auto text-xs">{showServerConfig ? '▲' : '▼'}</span>
				</button>

				{#if showServerConfig}
					<div class="mt-3 space-y-3">
						<label class="label">
							<span class="text-sm font-medium text-foreground">Server URL</span>
							<div class="flex rounded-md border border-input shadow-sm">
								<div class="flex items-center rounded-l-md border-r border-input bg-muted px-3 text-muted-foreground">
									<Globe size={14} />
								</div>
								<input
									type="url"
									class="flex h-9 w-full rounded-r-md bg-transparent px-3 py-1 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
									placeholder="https://your-site.com"
									bind:value={serverUrl}
								/>
							</div>
						</label>

						<label class="label">
							<span class="text-sm font-medium text-foreground">Environment</span>
							<input
								type="text"
								class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
								placeholder="localhost"
								bind:value={environment}
							/>
						</label>
					</div>
				{/if}
			</div>

			{#if showServerConfig}
				<hr class="border-border" />
			{/if}

			<!-- Login Form -->
			<form onsubmit={handleLogin} class="space-y-4">
				{#if error}
					<div class="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950/30 dark:text-red-300">
						{error}
					</div>
				{/if}

				<label class="label">
					<span class="text-sm font-medium text-foreground">Username</span>
					<input
						type="text"
						class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
						placeholder="admin"
						bind:value={username}
						required
						autocomplete="username"
						disabled={loading}
					/>
				</label>

				<label class="label">
					<span class="text-sm font-medium text-foreground">Password</span>
					<input
						type="password"
						class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
						placeholder="••••••••"
						bind:value={password}
						required
						autocomplete="current-password"
						disabled={loading}
					/>
				</label>

				<button
					type="submit"
					class="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 w-full gap-2"
					disabled={loading || !username || !password}
				>
					{#if loading}
						<span class="animate-spin">⏳</span>
						<span>Signing in...</span>
					{:else}
						<LogIn size={16} />
						<span>Sign In</span>
					{/if}
				</button>
			</form>
		</div>

		<p class="mt-6 text-center text-xs text-muted-foreground">
			Powered by Grav CMS
		</p>
	</div>
</div>
