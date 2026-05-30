<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import {
		getInvitations,
		deleteInvitation,
		resendInvitation,
		type Invitation,
	} from '$lib/api/endpoints/invitations';
	import { Button } from '$lib/components/ui/button';
	import StickyHeader from '$lib/components/ui/StickyHeader.svelte';
	import UsersTabNav from '$lib/components/users/UsersTabNav.svelte';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import { toast } from 'svelte-sonner';
	import { canWrite } from '$lib/utils/permissions';
	import { Loader2, MailPlus, Send, Trash2, Clock, Mail } from 'lucide-svelte';

	let invitations = $state<Invitation[]>([]);
	let loading = $state(true);
	let busyToken = $state<string | null>(null);

	let confirmOpen = $state(false);
	let pendingRevoke = $state<Invitation | null>(null);

	const canManage = $derived(canWrite('users'));

	onMount(load);

	async function load() {
		loading = true;
		try {
			invitations = await getInvitations();
		} catch (err: unknown) {
			const msg =
				err && typeof err === 'object' && 'message' in err
					? (err as { message: string }).message
					: i18n.t('ADMIN_NEXT.INVITATIONS.LOAD_FAILED');
			toast.error(msg);
		} finally {
			loading = false;
		}
	}

	function expiresLabel(ts: number): string {
		const secs = ts - Math.floor(Date.now() / 1000);
		if (secs <= 0) return i18n.t('ADMIN_NEXT.INVITATIONS.EXPIRED');
		const days = Math.floor(secs / 86400);
		if (days >= 1) return i18n.t('ADMIN_NEXT.INVITATIONS.EXPIRES_IN_DAYS', { count: days });
		const hours = Math.max(1, Math.floor(secs / 3600));
		return i18n.t('ADMIN_NEXT.INVITATIONS.EXPIRES_IN_HOURS', { count: hours });
	}

	async function resend(invite: Invitation) {
		busyToken = invite.token;
		try {
			await resendInvitation(invite.token);
			toast.success(i18n.t('ADMIN_NEXT.INVITATIONS.RESENT_TOAST', { email: invite.email }));
		} catch (err: unknown) {
			const msg =
				err && typeof err === 'object' && 'message' in err
					? (err as { message: string }).message
					: i18n.t('ADMIN_NEXT.INVITATIONS.RESEND_FAILED');
			toast.error(msg);
		} finally {
			busyToken = null;
		}
	}

	function askRevoke(invite: Invitation) {
		pendingRevoke = invite;
		confirmOpen = true;
	}

	async function confirmRevoke() {
		if (!pendingRevoke) return;
		const token = pendingRevoke.token;
		confirmOpen = false;
		busyToken = token;
		try {
			await deleteInvitation(token);
			invitations = invitations.filter((i) => i.token !== token);
			toast.success(i18n.t('ADMIN_NEXT.INVITATIONS.REVOKED_TOAST'));
		} catch (err: unknown) {
			const msg =
				err && typeof err === 'object' && 'message' in err
					? (err as { message: string }).message
					: i18n.t('ADMIN_NEXT.INVITATIONS.REVOKE_FAILED');
			toast.error(msg);
		} finally {
			busyToken = null;
			pendingRevoke = null;
		}
	}
</script>

<svelte:head>
	<title>{i18n.t('ADMIN_NEXT.USERS_NAV.INVITATIONS')}</title>
</svelte:head>

<div class="flex h-full flex-col">
	<StickyHeader noBorder>
		{#snippet children({ scrolled })}
			<div class="px-6 transition-[padding] duration-200 {scrolled ? 'py-2' : 'pt-6 pb-3'}">
				<div class="flex items-center justify-between {scrolled ? 'min-h-6' : 'min-h-8'}">
					<div>
						<h1 class="font-semibold tracking-tight text-foreground transition-[font-size] duration-200 {scrolled ? 'text-sm' : 'text-xl'}">{i18n.t('ADMIN_NEXT.USERS_NAV.INVITATIONS')}</h1>
						{#if !scrolled}
							<p class="mt-0.5 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.INVITATIONS.PENDING_COUNT', { count: invitations.length })}</p>
						{/if}
					</div>
					{#if canManage}
						<Button size="sm" onclick={() => goto(`${base}/users/invite`)}>
							<MailPlus size={14} class="me-1.5" />
							{i18n.t('ADMIN_NEXT.INVITATIONS.INVITE_USER')}
						</Button>
					{/if}
				</div>
			</div>
		{/snippet}
	</StickyHeader>

	<UsersTabNav />

	{#if loading}
		<div class="flex flex-1 items-center justify-center">
			<Loader2 size={24} class="animate-spin text-muted-foreground" />
		</div>
	{:else if invitations.length === 0}
		<div class="flex flex-1 flex-col items-center justify-center gap-3 text-center">
			<div class="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
				<Mail size={20} />
			</div>
			<p class="text-sm font-medium text-foreground">{i18n.t('ADMIN_NEXT.INVITATIONS.NONE_PENDING')}</p>
			<p class="max-w-sm text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.INVITATIONS.NONE_PENDING_HINT')}</p>
			{#if canManage}
				<Button size="sm" class="mt-1" onclick={() => goto(`${base}/users/invite`)}>
					<MailPlus size={14} class="me-1.5" />
					{i18n.t('ADMIN_NEXT.INVITATIONS.INVITE_USER')}
				</Button>
			{/if}
		</div>
	{:else}
		<div class="flex-1 overflow-y-auto">
			<div class="space-y-2 px-6 py-4">
				{#each invitations as invite (invite.token)}
					<div class="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3">
						<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
							<Mail size={16} />
						</div>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium text-foreground">{invite.email}</p>
							<div class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
								<span class="inline-flex items-center gap-1">
									<Clock size={12} />
									{invite.expired ? i18n.t('ADMIN_NEXT.INVITATIONS.EXPIRED') : expiresLabel(invite.expires)}
								</span>
								{#if invite.created_by_name}
									<span>{i18n.t('ADMIN_NEXT.INVITATIONS.INVITED_BY', { name: invite.created_by_name })}</span>
								{/if}
								{#each invite.groups as g (g)}
									<span class="rounded-full bg-muted px-2 py-0.5">{g}</span>
								{/each}
							</div>
						</div>
						{#if canManage}
							<div class="flex shrink-0 items-center gap-1">
								<Button
									variant="ghost"
									size="sm"
									disabled={busyToken === invite.token}
									onclick={() => resend(invite)}
									title={i18n.t('ADMIN_NEXT.INVITATIONS.RESEND')}
								>
									{#if busyToken === invite.token}
										<Loader2 size={14} class="animate-spin" />
									{:else}
										<Send size={14} />
									{/if}
								</Button>
								<Button
									variant="ghost"
									size="sm"
									class="text-destructive hover:text-destructive"
									disabled={busyToken === invite.token}
									onclick={() => askRevoke(invite)}
									title={i18n.t('ADMIN_NEXT.INVITATIONS.REVOKE')}
								>
									<Trash2 size={14} />
								</Button>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<ConfirmModal
	open={confirmOpen}
	title={i18n.t('ADMIN_NEXT.INVITATIONS.REVOKE_TITLE')}
	message={pendingRevoke ? i18n.t('ADMIN_NEXT.INVITATIONS.CONFIRM_REVOKE', { email: pendingRevoke.email }) : ''}
	confirmLabel={i18n.t('ADMIN_NEXT.INVITATIONS.REVOKE')}
	variant="destructive"
	onconfirm={confirmRevoke}
	oncancel={() => { confirmOpen = false; pendingRevoke = null; }}
/>
