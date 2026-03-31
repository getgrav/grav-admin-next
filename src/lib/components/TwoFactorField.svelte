<script lang="ts">
	import { generate2fa, type TwoFactorData } from '$lib/api/endpoints/users';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import { Loader2, RefreshCw, ShieldCheck } from 'lucide-svelte';

	interface Props {
		username: string;
		twofaEnabled: boolean;
		hasSecret: boolean;
	}

	let { username, twofaEnabled, hasSecret }: Props = $props();

	let twoFaData = $state<TwoFactorData | null>(null);
	let generating = $state(false);

	async function handleGenerate() {
		generating = true;
		try {
			twoFaData = await generate2fa(username);
			toast.success('2FA secret generated');
		} catch {
			toast.error('Failed to generate 2FA secret');
		} finally {
			generating = false;
		}
	}
</script>

{#if twofaEnabled}
	<div class="rounded-lg border border-border bg-muted/30 p-4">
		{#if twoFaData}
			<!-- Show QR code and secret -->
			<div class="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
				<div class="shrink-0 overflow-hidden rounded-lg border border-border bg-white p-2">
					<img src={twoFaData.qr_code} alt="2FA QR Code" class="h-40 w-40" />
				</div>
				<div class="min-w-0 flex-1">
					<p class="text-sm text-muted-foreground">
						Scan this QR code with your Authenticator app (Google Authenticator, Authy, etc.)
					</p>
					<div class="mt-3">
						<span class="text-xs font-medium text-muted-foreground">2FA Secret:</span>
						<code class="mt-1 block rounded bg-muted px-3 py-2 font-mono text-sm font-semibold tracking-widest text-foreground">
							{twoFaData.secret}
						</code>
					</div>
					<Button variant="outline" size="sm" class="mt-3" onclick={handleGenerate} disabled={generating}>
						{#if generating}
							<Loader2 size={13} class="animate-spin" />
						{:else}
							<RefreshCw size={13} />
						{/if}
						Regenerate
					</Button>
				</div>
			</div>
		{:else if hasSecret}
			<!-- Secret exists but not shown (already configured) -->
			<div class="flex items-center gap-3">
				<ShieldCheck size={20} class="text-green-500" />
				<div class="flex-1">
					<p class="text-sm font-medium text-foreground">2FA is configured</p>
					<p class="text-xs text-muted-foreground">A secret is already set for this account.</p>
				</div>
				<Button variant="outline" size="sm" onclick={handleGenerate} disabled={generating}>
					{#if generating}
						<Loader2 size={13} class="animate-spin" />
					{:else}
						<RefreshCw size={13} />
					{/if}
					Regenerate
				</Button>
			</div>
		{:else}
			<!-- No secret yet — offer to generate -->
			<div class="flex items-center gap-3">
				<ShieldCheck size={20} class="text-muted-foreground" />
				<div class="flex-1">
					<p class="text-sm text-muted-foreground">No 2FA secret configured yet.</p>
				</div>
				<Button size="sm" onclick={handleGenerate} disabled={generating}>
					{#if generating}
						<Loader2 size={13} class="mr-1.5 animate-spin" />
					{/if}
					Generate Secret
				</Button>
			</div>
		{/if}
	</div>
{/if}
