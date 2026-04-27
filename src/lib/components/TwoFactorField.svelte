<script lang="ts">
	import { generate2fa, enable2fa, disable2fa, type TwoFactorData } from '$lib/api/endpoints/users';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import { Loader2, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-svelte';

	interface Props {
		username: string;
		/** Whether 2FA is currently enabled on the user account. */
		twofaEnabled: boolean;
		/** Whether a 2FA secret has been generated (even if not yet enabled). */
		hasSecret: boolean;
		/** Whether the current admin can force-disable without a code. */
		isAdminActor?: boolean;
		/** Called after enable or disable succeeds so the parent can refresh state. */
		onstatechange?: (enabled: boolean) => void;
	}

	let {
		username,
		twofaEnabled,
		hasSecret,
		isAdminActor = false,
		onstatechange,
	}: Props = $props();

	type Stage = 'idle' | 'pending' | 'enabled';
	let stage = $state<Stage>('idle');
	let twoFaData = $state<TwoFactorData | null>(null);
	let enrollCode = $state('');
	let disableCode = $state('');
	let busy = $state(false);
	let showDisable = $state(false);

	// Sync stage with props. Runs on mount and whenever props change, but
	// skips while a user-initiated transition is in flight so we don't
	// clobber the intermediate `pending` state with a stale prop value.
	$effect(() => {
		const next: Stage = twofaEnabled ? 'enabled' : hasSecret ? 'pending' : 'idle';
		if (next === stage || busy) return;
		// After a local generate the parent's `hasSecret` prop is stale until
		// it refetches; don't revert our freshly-set `pending` stage to idle.
		if (stage === 'pending' && next === 'idle' && twoFaData) return;
		stage = next;
		if (next !== 'pending') twoFaData = null;
	});

	async function handleGenerate() {
		busy = true;
		try {
			twoFaData = await generate2fa(username);
			stage = 'pending';
			enrollCode = '';
			toast.success('Scan the QR code with your authenticator app');
		} catch {
			toast.error('Failed to generate 2FA secret');
		} finally {
			busy = false;
		}
	}

	async function handleEnable() {
		if (!/^\d{6}$/.test(enrollCode.trim())) {
			toast.error('Enter the 6-digit code from your authenticator');
			return;
		}
		busy = true;
		try {
			await enable2fa(username, enrollCode.trim());
			stage = 'enabled';
			twoFaData = null;
			enrollCode = '';
			toast.success('2FA enabled');
			onstatechange?.(true);
		} catch (err: unknown) {
			const msg =
				err && typeof err === 'object' && 'message' in err
					? String((err as { message: string }).message)
					: 'Invalid code';
			toast.error(msg);
		} finally {
			busy = false;
		}
	}

	async function handleDisable(forced = false) {
		if (!forced && !/^\d{6}$/.test(disableCode.trim())) {
			toast.error('Enter the 6-digit code from your authenticator');
			return;
		}
		busy = true;
		try {
			await disable2fa(username, forced ? undefined : disableCode.trim());
			stage = 'idle';
			disableCode = '';
			showDisable = false;
			toast.success('2FA disabled');
			onstatechange?.(false);
		} catch (err: unknown) {
			const msg =
				err && typeof err === 'object' && 'message' in err
					? String((err as { message: string }).message)
					: 'Failed to disable 2FA';
			toast.error(msg);
		} finally {
			busy = false;
		}
	}
</script>

<div class="rounded-lg border border-border bg-muted/30 p-4">
	{#if stage === 'idle'}
		<div class="flex items-center gap-3">
			<ShieldX size={20} class="text-muted-foreground" />
			<div class="flex-1">
				<p class="text-sm font-medium text-foreground">Two-factor authentication is off</p>
				<p class="text-xs text-muted-foreground">
					Add an extra layer of security by requiring a one-time code on sign-in.
				</p>
			</div>
			<Button size="sm" onclick={handleGenerate} disabled={busy}>
				{#if busy}
					<Loader2 size={13} class="animate-spin" />
				{/if}
				Enable 2FA
			</Button>
		</div>
	{:else if stage === 'pending'}
		<div class="space-y-4">
			<div class="flex items-start gap-3">
				<ShieldAlert size={20} class="mt-0.5 text-amber-500" />
				<div class="flex-1">
					<p class="text-sm font-medium text-foreground">Finish enabling 2FA</p>
					<p class="text-xs text-muted-foreground">
						Scan the QR code with your authenticator app, then enter the 6-digit code to verify and activate.
					</p>
				</div>
			</div>

			{#if twoFaData}
				<div class="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
					<div class="shrink-0 overflow-hidden rounded-lg border border-border bg-white p-2">
						<img src={twoFaData.qr_code} alt="2FA QR Code" class="h-40 w-40" />
					</div>
					<div class="min-w-0 flex-1">
						<span class="text-xs font-medium text-muted-foreground">Secret (for manual entry):</span>
						<code class="mt-1 block rounded bg-muted px-3 py-2 font-mono text-sm font-semibold tracking-widest text-foreground">
							{twoFaData.secret}
						</code>
					</div>
				</div>
			{:else}
				<div class="rounded-md border border-dashed border-border bg-background px-3 py-3 text-xs text-muted-foreground">
					A secret is already generated but not shown for security reasons.
					<button
						type="button"
						class="ml-1 font-medium text-foreground underline-offset-2 hover:underline"
						onclick={handleGenerate}
						disabled={busy}
					>
						Regenerate and show QR
					</button>
				</div>
			{/if}

			<div class="space-y-1.5">
				<label for="enroll-code" class="text-xs font-medium text-foreground">Verification code</label>
				<div class="flex gap-2">
					<input
						id="enroll-code"
						type="text"
						inputmode="numeric"
						pattern="[0-9]*"
						maxlength="6"
						placeholder="000000"
						class="flex h-9 flex-1 rounded-md border border-input bg-transparent px-3 py-1 text-center font-mono text-sm tracking-[0.3em] shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
						bind:value={enrollCode}
						disabled={busy}
					/>
					<Button size="sm" onclick={handleEnable} disabled={busy}>
						{#if busy}
							<Loader2 size={13} class="animate-spin" />
						{/if}
						Verify &amp; Enable
					</Button>
				</div>
			</div>
		</div>
	{:else}
		<div class="space-y-3">
			<div class="flex items-center gap-3">
				<ShieldCheck size={20} class="text-green-500" />
				<div class="flex-1">
					<p class="text-sm font-medium text-foreground">2FA is enabled</p>
					<p class="text-xs text-muted-foreground">
						A one-time code is required whenever this account signs in.
					</p>
				</div>
				{#if !showDisable}
					<Button variant="outline" size="sm" onclick={() => (showDisable = true)} disabled={busy}>
						Disable
					</Button>
				{/if}
			</div>

			{#if showDisable}
				{#if isAdminActor}
					<div class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-3">
						<p class="text-xs text-foreground">
							Force-disable 2FA for <span class="font-medium">{username}</span>?
							Use this only for lost-device recovery.
						</p>
						<div class="mt-2 flex gap-2">
							<Button variant="destructive" size="sm" onclick={() => handleDisable(true)} disabled={busy}>
								{#if busy}
									<Loader2 size={13} class="animate-spin" />
								{/if}
								Force disable
							</Button>
							<Button variant="outline" size="sm" onclick={() => (showDisable = false)} disabled={busy}>
								Cancel
							</Button>
						</div>
					</div>
				{:else}
					<div class="space-y-1.5 rounded-md border border-border bg-background px-3 py-3">
						<label for="disable-code" class="text-xs font-medium text-foreground">
							Enter your current 6-digit code to confirm
						</label>
						<div class="flex gap-2">
							<input
								id="disable-code"
								type="text"
								inputmode="numeric"
								pattern="[0-9]*"
								maxlength="6"
								placeholder="000000"
								class="flex h-9 flex-1 rounded-md border border-input bg-transparent px-3 py-1 text-center font-mono text-sm tracking-[0.3em] shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
								bind:value={disableCode}
								disabled={busy}
							/>
							<Button variant="destructive" size="sm" onclick={() => handleDisable(false)} disabled={busy}>
								{#if busy}
									<Loader2 size={13} class="animate-spin" />
								{/if}
								Confirm disable
							</Button>
							<Button variant="outline" size="sm" onclick={() => (showDisable = false)} disabled={busy}>
								Cancel
							</Button>
						</div>
					</div>
				{/if}
			{/if}
		</div>
	{/if}
</div>
