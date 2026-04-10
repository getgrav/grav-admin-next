<script lang="ts">
	import { base } from '$app/paths';
	import { forgotPassword } from '$lib/api/auth';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Sun, Moon, Mail, ArrowLeft, Loader2 } from 'lucide-svelte';
	import { theme } from '$lib/stores/theme.svelte';
	import BrandLogo from '$lib/components/ui/BrandLogo.svelte';

	let email = $state('');
	let loading = $state(false);
	let submitted = $state(false);
	let emailInvalid = $state(false);

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
			const result = await forgotPassword(trimmed);
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
				toast.error('Unable to connect to server.');
			}
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Forgot password — Grav Admin</title>
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
			<h1 class="text-2xl font-semibold tracking-tight text-foreground">Forgot password</h1>
			<p class="mt-1 text-[13px] text-muted-foreground">
				{#if submitted}
					Check your inbox for a reset link.
				{:else}
					Enter your email and we'll send you a reset link.
				{/if}
			</p>
		</div>

		<div class="rounded-lg border border-border bg-card shadow-sm">
			{#if !submitted}
				<form onsubmit={handleSubmit} class="space-y-4 px-6 py-5" novalidate>
					<div class="space-y-1.5">
						<label for="email" class="text-[13px] font-medium text-foreground">Email address</label>
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
							<p class="text-xs text-red-500">Enter a valid email address</p>
						{/if}
					</div>

					<Button type="submit" class="w-full" disabled={loading}>
						{#if loading}
							<Loader2 size={15} class="animate-spin" />
							Sending...
						{:else}
							<Mail size={15} />
							Send reset link
						{/if}
					</Button>
				</form>
			{:else}
				<div class="px-6 py-5 text-center text-[13px] text-muted-foreground">
					If an account exists for that email, a reset link has been sent.
				</div>
			{/if}

			<div class="border-t border-border px-6 py-3">
				<a
					href="{base}/login"
					class="flex items-center justify-center gap-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
				>
					<ArrowLeft size={12} />
					Back to sign in
				</a>
			</div>
		</div>
	</div>
</div>
