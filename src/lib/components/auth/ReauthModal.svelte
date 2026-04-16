<script lang="ts">
	/**
	 * In-place re-auth modal. Opens when token expiry or refresh failure is
	 * detected. Preserves the current route and any queued API requests, then
	 * swaps in the new token and retries them — the user never loses state.
	 *
	 * The modal is intentionally mounted at the app shell level so it overlays
	 * whatever view is active (blueprint editor, media upload, etc.).
	 */
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { auth } from '$lib/stores/auth.svelte';
	import { authSession } from '$lib/stores/auth-session.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { LockKeyhole } from 'lucide-svelte';

	let password = $state('');
	let submitting = $state(false);
	let error = $state<string | null>(null);

	// Autofocus when opened — the Input doesn't forward refs, so grab by id.
	$effect(() => {
		if (authSession.reauthOpen) {
			queueMicrotask(() => {
				const el = document.getElementById('reauth-password') as HTMLInputElement | null;
				el?.focus();
			});
		}
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

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (submitting || !password.trim()) return;

		submitting = true;
		error = null;
		try {
			const baseUrl = `${auth.serverUrl}${auth.apiPrefix || '/api/v1'}`;
			const response = await fetch(`${baseUrl}/auth/token`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
				body: JSON.stringify({ username: auth.username, password }),
			});
			if (!response.ok) {
				if (response.status === 401) {
					error = 'Invalid password';
				} else {
					error = `Sign-in failed (${response.status})`;
				}
				submitting = false;
				return;
			}
			const body = await response.json();
			const data = body.data ?? body;
			auth.setTokens(data.access_token, data.refresh_token, data.expires_in);

			// Update permissions if included in the token response
			if (data.user) {
				auth.setPermissions(data.user.super_admin ?? false, data.user.access ?? {});
			}

			// Re-schedule the refresh timer with the fresh token
			authSession.schedule();
			authSession.closeReauth();
			password = '';

			// Retry queued requests — the API client supplies the retry callback
			// via a module-level registration (see api/client.ts).
			const retryFn = (window as any).__apiClientRetry__;
			if (retryFn) {
				await authSession.retryPending(retryFn);
			}
		} catch {
			error = 'Network error — please try again';
		} finally {
			submitting = false;
		}
	}

	async function handleSignOut() {
		authSession.rejectPending(new Error('User signed out'));
		authSession.closeReauth();
		authSession.stop();
		auth.logout();
		await goto(`${base}/login`);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') handleSignOut();
	}
</script>

<svelte:window onkeydown={authSession.reauthOpen ? handleKeydown : undefined} />

{#if authSession.reauthOpen}
	<div
		class="fixed inset-0 z-[60] flex items-center justify-center bg-neutral-900/75 p-4 backdrop-blur-sm"
		role="dialog"
		aria-modal="true"
		aria-labelledby="reauth-title"
	>
		<div class="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl">
			<div class="flex gap-4">
				<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
					<LockKeyhole size={20} class="text-primary" />
				</div>
				<div class="min-w-0 flex-1">
					<h3 id="reauth-title" class="text-base font-semibold text-foreground">
						Session expired
					</h3>
					<p class="mt-1.5 text-sm text-muted-foreground">
						Please re-enter your password to continue. Your work has been preserved.
					</p>
				</div>
			</div>

			<form onsubmit={handleSubmit} class="mt-5 space-y-3">
				<div>
					<label for="reauth-username" class="text-[13px] font-medium text-foreground">
						Username
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
					<label for="reauth-password" class="text-[13px] font-medium text-foreground">
						Password
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
				{#if error}
					<p class="text-[13px] text-destructive">{error}</p>
				{/if}
				<div class="flex justify-end gap-2 pt-1">
					<Button type="button" variant="outline" size="sm" onclick={handleSignOut} disabled={submitting}>
						Sign out
					</Button>
					<Button type="submit" size="sm" disabled={submitting || !password.trim()}>
						{submitting ? 'Signing in…' : 'Sign in'}
					</Button>
				</div>
			</form>
		</div>
	</div>
{/if}
