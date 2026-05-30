<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { createInvitation, type Invitation } from '$lib/api/endpoints/invitations';
	import { getGroups, type GroupInfo } from '$lib/api/endpoints/groups';
	import PermissionsField from '$lib/components/PermissionsField.svelte';
	import { Button } from '$lib/components/ui/button';
	import StickyHeader from '$lib/components/ui/StickyHeader.svelte';
	import { toast } from 'svelte-sonner';
	import { Loader2, Send, MailPlus, Copy, Check, AlertTriangle } from 'lucide-svelte';
	import DirectionalIcon from '$lib/components/ui/DirectionalIcon.svelte';

	let email = $state('');
	let fullname = $state('');
	let message = $state('');
	let expiration = $state(604800);
	let access = $state<Record<string, unknown>>({});
	let selectedGroups = $state<string[]>([]);
	let saving = $state(false);

	let groups = $state<GroupInfo[]>([]);
	let groupsLoading = $state(true);

	// Result panel shown after a successful invite.
	let result = $state<Invitation | null>(null);
	let copied = $state(false);

	const emailValid = $derived(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()));
	const canSend = $derived(emailValid && !saving);

	const expirationOptions = $derived([
		{ value: 86400, label: i18n.t('ADMIN_NEXT.INVITATIONS.EXPIRY_1_DAY') },
		{ value: 259200, label: i18n.t('ADMIN_NEXT.INVITATIONS.EXPIRY_3_DAYS') },
		{ value: 604800, label: i18n.t('ADMIN_NEXT.INVITATIONS.EXPIRY_7_DAYS') },
		{ value: 1209600, label: i18n.t('ADMIN_NEXT.INVITATIONS.EXPIRY_14_DAYS') },
		{ value: 2592000, label: i18n.t('ADMIN_NEXT.INVITATIONS.EXPIRY_30_DAYS') },
	]);

	$effect(() => {
		loadGroups();
	});

	async function loadGroups() {
		groupsLoading = true;
		try {
			const res = await getGroups(1, 200);
			groups = res.groups;
		} catch {
			groups = [];
		} finally {
			groupsLoading = false;
		}
	}

	function toggleGroup(name: string) {
		if (selectedGroups.includes(name)) {
			selectedGroups = selectedGroups.filter((g) => g !== name);
		} else {
			selectedGroups = [...selectedGroups, name];
		}
	}

	function handleAccessChange(newAccess: Record<string, unknown>) {
		access = newAccess;
	}

	async function handleSend() {
		saving = true;
		try {
			result = await createInvitation({
				email: email.trim(),
				fullname: fullname || undefined,
				message: message || undefined,
				expiration,
				access: Object.keys(access).length > 0 ? access : undefined,
				groups: selectedGroups.length > 0 ? selectedGroups : undefined,
			});
			if (result.email_sent) {
				toast.success(i18n.t('ADMIN_NEXT.INVITATIONS.SENT_TOAST', { email: email.trim() }));
			} else {
				toast.warning(i18n.t('ADMIN_NEXT.INVITATIONS.CREATED_NO_EMAIL_TOAST'));
			}
		} catch (err: unknown) {
			const msg =
				err && typeof err === 'object' && 'message' in err
					? (err as { message: string }).message
					: i18n.t('ADMIN_NEXT.INVITATIONS.SEND_FAILED');
			toast.error(msg);
		} finally {
			saving = false;
		}
	}

	async function copyLink() {
		if (!result?.link) return;
		try {
			await navigator.clipboard.writeText(result.link);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.INVITATIONS.COPY_FAILED'));
		}
	}

	function reset() {
		result = null;
		email = '';
		fullname = '';
		message = '';
		access = {};
		selectedGroups = [];
	}

	function handleKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 's') {
			e.preventDefault();
			if (canSend) handleSend();
		}
	}
</script>

<svelte:head>
	<title>{i18n.t('ADMIN_NEXT.INVITATIONS.INVITE_USER')}</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="flex h-full flex-col">
	<StickyHeader>
		{#snippet children({ scrolled })}
			<div class="px-6 transition-[padding] duration-200 {scrolled ? 'py-2' : 'pt-6 pb-3'}">
				<div class="flex items-center justify-between gap-4 {scrolled ? 'min-h-6' : 'min-h-8'}">
					<div class="flex items-center gap-3">
						<button
							type="button"
							class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
							onclick={() => goto(`${base}/users/invitations`)}
						>
							<DirectionalIcon name="arrow-back" size={16} />
						</button>
						{#if !scrolled}
							<div class="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
								<MailPlus size={16} />
							</div>
						{/if}
						<h1 class="font-semibold text-foreground transition-[font-size] duration-200 {scrolled ? 'text-sm' : 'text-lg'}">{i18n.t('ADMIN_NEXT.INVITATIONS.INVITE_USER')}</h1>
					</div>

					{#if !result}
						<Button size="sm" onclick={handleSend} disabled={!canSend}>
							{#if saving}
								<Loader2 size={14} class="me-1.5 animate-spin" />
							{:else}
								<Send size={14} class="me-1.5" />
							{/if}
							{i18n.t('ADMIN_NEXT.INVITATIONS.SEND_INVITE')}
						</Button>
					{/if}
				</div>
			</div>
		{/snippet}
	</StickyHeader>

	<div class="flex-1 overflow-y-auto">
		<div class="space-y-6 px-6 py-6">
			{#if result}
				<!-- Success / link panel -->
				<div class="rounded-xl border border-border bg-card p-5">
					<div class="flex items-center gap-2">
						<div class="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
							<Check size={16} />
						</div>
						<h2 class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.INVITATIONS.INVITE_READY')}</h2>
					</div>

					{#if result.warning}
						<div class="mt-4 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
							<AlertTriangle size={14} class="mt-0.5 shrink-0" />
							<span>{result.warning}</span>
						</div>
					{:else}
						<p class="mt-3 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.INVITATIONS.EMAIL_SENT_TO', { email: result.email })}</p>
					{/if}

					<label for="invite-link" class="mt-4 block text-xs font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.INVITATIONS.INVITE_LINK')}</label>
					<div class="mt-1 flex gap-2">
						<input
							id="invite-link"
							type="text"
							readonly
							value={result.link ?? ''}
							class="h-9 w-full rounded-md border border-input bg-muted/40 px-3 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
						/>
						<Button size="sm" variant="outline" onclick={copyLink}>
							{#if copied}
								<Check size={14} class="me-1.5" />{i18n.t('ADMIN_NEXT.INVITATIONS.COPIED')}
							{:else}
								<Copy size={14} class="me-1.5" />{i18n.t('ADMIN_NEXT.INVITATIONS.COPY')}
							{/if}
						</Button>
					</div>

					<div class="mt-5 flex gap-2">
						<Button size="sm" variant="outline" onclick={reset}>{i18n.t('ADMIN_NEXT.INVITATIONS.INVITE_ANOTHER')}</Button>
						<Button size="sm" onclick={() => goto(`${base}/users/invitations`)}>{i18n.t('ADMIN_NEXT.INVITATIONS.VIEW_PENDING')}</Button>
					</div>
				</div>
			{:else}
				<!-- Invitee details -->
				<div class="rounded-xl border border-border bg-card p-5">
					<h2 class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.INVITATIONS.RECIPIENT')}</h2>
					<p class="mt-1 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.INVITATIONS.RECIPIENT_HINT')}</p>
					<div class="mt-4 space-y-4">
						<div>
							<label for="email" class="block text-xs font-medium text-muted-foreground">
								{i18n.t('ADMIN_NEXT.INVITATIONS.EMAIL')} <span class="text-destructive">*</span>
							</label>
							<input
								id="email"
								type="email"
								bind:value={email}
								placeholder="name@example.com"
								class="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
							/>
						</div>
						<div>
							<label for="fullname" class="block text-xs font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.INVITATIONS.FULL_NAME_OPTIONAL')}</label>
							<input
								id="fullname"
								type="text"
								bind:value={fullname}
								class="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
							/>
						</div>
						<div>
							<label for="message" class="block text-xs font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.INVITATIONS.MESSAGE_OPTIONAL')}</label>
							<textarea
								id="message"
								bind:value={message}
								rows="2"
								class="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
							></textarea>
						</div>
						<div>
							<label for="expiration" class="block text-xs font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.INVITATIONS.EXPIRES_AFTER')}</label>
							<select
								id="expiration"
								bind:value={expiration}
								class="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
							>
								{#each expirationOptions as opt (opt.value)}
									<option value={opt.value}>{opt.label}</option>
								{/each}
							</select>
						</div>
					</div>
				</div>

				<!-- Groups -->
				<div class="rounded-xl border border-border bg-card p-5">
					<h2 class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.INVITATIONS.GROUPS')}</h2>
					<p class="mt-1 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.INVITATIONS.GROUPS_HINT')}</p>
					<div class="mt-4">
						{#if groupsLoading}
							<div class="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={14} class="animate-spin" /> {i18n.t('ADMIN_NEXT.INVITATIONS.LOADING_GROUPS')}</div>
						{:else if groups.length === 0}
							<p class="text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.INVITATIONS.NO_GROUPS')}</p>
						{:else}
							<div class="flex flex-wrap gap-2">
								{#each groups as group (group.groupname)}
									<button
										type="button"
										onclick={() => toggleGroup(group.groupname)}
										class="rounded-full border px-3 py-1 text-xs font-medium transition-colors
											{selectedGroups.includes(group.groupname)
												? 'border-primary bg-primary/10 text-primary'
												: 'border-border text-muted-foreground hover:text-foreground'}"
									>
										{group.readableName || group.groupname}
									</button>
								{/each}
							</div>
						{/if}
					</div>
				</div>

				<!-- Permissions -->
				<div class="rounded-xl border border-border bg-card p-5">
					<h2 class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.INVITATIONS.PERMISSIONS')}</h2>
					<p class="mt-1 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.INVITATIONS.PERMISSIONS_HINT')}</p>
					<div class="mt-4">
						<PermissionsField value={access} onchange={handleAccessChange} />
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>
