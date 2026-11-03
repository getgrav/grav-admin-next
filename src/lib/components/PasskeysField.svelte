<script lang="ts">
	/**
	 * The Passkeys card on a user's page. Hidden entirely when the site doesn't
	 * offer passkeys.
	 *
	 * Your own account: the list, Add a passkey (the current password, or the
	 * 2FA code for an account without one, is asked for inline first), rename
	 * in place, and remove with the same proof. Someone else's: the list, and
	 * Remove for a lost device when the viewer may write users. Nobody can add
	 * or rename a passkey on another account; the API refuses it too.
	 *
	 * Outcomes of the browser's passkey dialog (cancelled, already saved) show
	 * as a line in the card rather than a toast, so closing the dialog doesn't
	 * read as an error.
	 */
	import { i18n } from '$lib/stores/i18n.svelte';
	import {
		getPasskeys,
		startAddPasskey,
		finishAddPasskey,
		renamePasskey,
		removePasskey,
		type PasskeyInfo,
		type PasskeyList,
		type PasskeyProof
	} from '$lib/api/endpoints/users';
	import {
		createPasskey,
		passkeysSupported,
		passkeyCancelled,
		passkeyAlreadySaved,
		rememberPasskeyUsed
	} from '$lib/utils/webauthn';
	import PasswordField from '$lib/components/ui/PasswordField.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { toast } from 'svelte-sonner';
	import { auth } from '$lib/stores/auth.svelte';
	import { canWrite } from '$lib/utils/permissions';
	import { Loader2, KeyRound, Pencil, Trash2, Plus, Info } from 'lucide-svelte';

	interface Props {
		username: string;
		/** Told the new count after a passkey is added or removed. */
		onchange?: (count: number) => void;
	}

	let { username, onchange }: Props = $props();

	const NAME_MAX = 60;

	const isSelf = $derived(username === auth.username);
	// Demo accounts can't change credentials (the server blocks it as well).
	const canRemoveOther = $derived(!isSelf && canWrite('users'));
	const supported = passkeysSupported();

	let data = $state<PasskeyList | null>(null);
	let loadFailed = $state(false);

	// Add: 'proof' while the password or code is asked for, 'waiting' while the
	// browser's dialog is open.
	let addStage = $state<'idle' | 'proof' | 'waiting'>('idle');
	let addProof = $state('');
	let addError = $state('');
	let busy = $state(false);
	// A calm line under the list after the browser's dialog (cancelled, etc.).
	let notice = $state<{ text: string; tone: 'muted' | 'warn' } | null>(null);

	let renameId = $state<string | null>(null);
	let renameValue = $state('');

	let removeId = $state<string | null>(null);
	let removeProof = $state('');
	let removeError = $state('');

	const proof = $derived(data?.proof ?? null);
	// An account with neither a password nor 2FA has nothing to prove a
	// change with, so the API refuses it; say so instead of offering Add.
	const proofUnavailable = $derived(isSelf && proof === 'unavailable');
	const canManageOwn = $derived(isSelf && !auth.demoMode && !proofUnavailable);
	const removeTarget = $derived(data?.passkeys.find((p) => p.id === removeId) ?? null);

	async function load(name = username) {
		try {
			data = await getPasskeys(name);
			loadFailed = false;
		} catch {
			// An older API without passkeys (404) or no access: leave the card out.
			loadFailed = true;
		}
	}

	$effect(() => {
		const name = username;
		data = null;
		resetAll();
		load(name);
	});

	function resetAll() {
		addStage = 'idle';
		addProof = '';
		addError = '';
		notice = null;
		renameId = null;
		removeId = null;
		removeProof = '';
		removeError = '';
	}

	function formatDate(ts: number | null): string {
		if (!ts) return '';
		const d = new Date(ts * 1000);
		try {
			return d.toLocaleDateString(i18n.lang || undefined, {
				year: 'numeric',
				month: 'short',
				day: 'numeric'
			});
		} catch {
			return d.toLocaleDateString();
		}
	}

	function proofBody(value: string): PasskeyProof {
		if (proof === 'password') return { current_password: value };
		if (proof === 'code') return { code: value.trim() };
		return {};
	}

	function proofMissing(value: string): boolean {
		if (proof === 'password') return value === '';
		if (proof === 'code') return !/^\d{6}$/.test(value.trim());
		return false;
	}

	/** A refused proof (422 / 429) as a line to show under its field, or null. */
	function proofRefusal(err: unknown): string | null {
		const status = (err as { status?: number })?.status ?? 0;
		if (status === 429) return i18n.t('ADMIN_NEXT.PASSKEYS_FIELD.TOO_MANY');
		if (status === 422) {
			const fields = (err as { error?: { errors?: { field?: string }[] } })?.error?.errors ?? [];
			if (fields.some((f) => f.field === 'code'))
				return i18n.t('ADMIN_NEXT.PASSKEYS_FIELD.CODE_WRONG');
			if (fields.some((f) => f.field === 'current_password'))
				return i18n.t('ADMIN_NEXT.PASSKEYS_FIELD.PASSWORD_WRONG');
		}
		return null;
	}

	function errorMessage(err: unknown, fallbackKey: string): string {
		const msg = (err as { message?: string })?.message;
		return msg && typeof msg === 'string' ? msg : i18n.t(fallbackKey);
	}

	// ── Add ──────────────────────────────────────────────────────────────

	function beginAdd() {
		notice = null;
		renameId = null;
		removeId = null;
		if (proof === null) {
			void runAdd({});
			return;
		}
		addStage = 'proof';
		addProof = '';
		addError = '';
	}

	function cancelAdd() {
		addStage = 'idle';
		addProof = '';
		addError = '';
	}

	async function submitAddProof(e: SubmitEvent) {
		e.preventDefault();
		if (busy) return;
		if (proofMissing(addProof)) {
			addError = i18n.t(
				proof === 'code'
					? 'ADMIN_NEXT.PASSKEYS_FIELD.CODE_REQUIRED'
					: 'ADMIN_NEXT.PASSKEYS_FIELD.PASSWORD_REQUIRED'
			);
			return;
		}
		const typed = addProof;
		addProof = '';
		await runAdd(proofBody(typed));
	}

	async function runAdd(body: PasskeyProof) {
		busy = true;
		addError = '';
		let start;
		try {
			start = await startAddPasskey(username, body);
		} catch (err) {
			busy = false;
			const refusal = proofRefusal(err);
			if (refusal && proof !== null) {
				addStage = 'proof';
				addError = refusal;
			} else {
				addStage = 'idle';
				toast.error(refusal ?? errorMessage(err, 'ADMIN_NEXT.PASSKEYS_FIELD.ADD_FAILED'));
			}
			return;
		}

		addStage = 'waiting';
		try {
			const credential = await createPasskey(start.options);
			const added = await finishAddPasskey(username, start.ticket, credential);
			rememberPasskeyUsed();
			addStage = 'idle';
			await load();
			onchange?.(data?.passkeys.length ?? 0);
			toast.success(i18n.t('ADMIN_NEXT.PASSKEYS_FIELD.ADDED', { name: added?.name ?? '' }));
		} catch (err) {
			addStage = 'idle';
			if (passkeyAlreadySaved(err)) {
				notice = { text: i18n.t('ADMIN_NEXT.PASSKEYS_FIELD.ALREADY_SAVED'), tone: 'warn' };
			} else if (passkeyCancelled(err)) {
				notice = { text: i18n.t('ADMIN_NEXT.PASSKEYS_FIELD.CANCELLED'), tone: 'muted' };
			} else {
				notice = { text: errorMessage(err, 'ADMIN_NEXT.PASSKEYS_FIELD.ADD_FAILED'), tone: 'warn' };
			}
		} finally {
			busy = false;
		}
	}

	// ── Rename ───────────────────────────────────────────────────────────

	function beginRename(pk: PasskeyInfo) {
		notice = null;
		removeId = null;
		cancelAdd();
		renameId = pk.id;
		renameValue = pk.name;
		queueMicrotask(() => {
			const el = document.getElementById(`passkey-rename-${pk.id}`) as HTMLInputElement | null;
			el?.focus();
			el?.select();
		});
	}

	async function submitRename(e: SubmitEvent) {
		e.preventDefault();
		if (busy || !renameId || !data) return;
		const name = renameValue.trim();
		if (name === '') {
			toast.error(i18n.t('ADMIN_NEXT.PASSKEYS_FIELD.NAME_REQUIRED'));
			return;
		}
		const id = renameId;
		const current = data.passkeys.find((p) => p.id === id);
		if (current && current.name === name) {
			renameId = null;
			return;
		}
		busy = true;
		try {
			const result = await renamePasskey(username, id, name);
			data = {
				...data,
				passkeys: data.passkeys.map((p) => (p.id === id ? { ...p, name: result?.name ?? name } : p))
			};
			renameId = null;
			toast.success(i18n.t('ADMIN_NEXT.PASSKEYS_FIELD.RENAMED'));
		} catch (err) {
			toast.error(errorMessage(err, 'ADMIN_NEXT.PASSKEYS_FIELD.RENAME_FAILED'));
		} finally {
			busy = false;
		}
	}

	function renameKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			renameId = null;
		}
	}

	// ── Remove ───────────────────────────────────────────────────────────

	function beginRemove(pk: PasskeyInfo) {
		notice = null;
		renameId = null;
		cancelAdd();
		removeId = pk.id;
		removeProof = '';
		removeError = '';
	}

	function cancelRemove() {
		removeId = null;
		removeProof = '';
		removeError = '';
	}

	async function submitRemove(e: SubmitEvent) {
		e.preventDefault();
		if (busy || !removeTarget) return;
		const ownProof = isSelf && proof !== null;
		if (ownProof && proofMissing(removeProof)) {
			removeError = i18n.t(
				proof === 'code'
					? 'ADMIN_NEXT.PASSKEYS_FIELD.CODE_REQUIRED'
					: 'ADMIN_NEXT.PASSKEYS_FIELD.PASSWORD_REQUIRED'
			);
			return;
		}
		const target = removeTarget;
		const body = ownProof ? proofBody(removeProof) : {};
		removeProof = '';
		removeError = '';
		busy = true;
		try {
			await removePasskey(username, target.id, body);
			removeId = null;
			if (data) data = { ...data, passkeys: data.passkeys.filter((p) => p.id !== target.id) };
			onchange?.(data?.passkeys.length ?? 0);
			toast.success(i18n.t('ADMIN_NEXT.PASSKEYS_FIELD.REMOVED', { name: target.name }));
		} catch (err) {
			const refusal = ownProof ? proofRefusal(err) : null;
			if (refusal) {
				removeError = refusal;
			} else {
				toast.error(errorMessage(err, 'ADMIN_NEXT.PASSKEYS_FIELD.REMOVE_FAILED'));
			}
		} finally {
			busy = false;
		}
	}
</script>

{#snippet proofInput(id: string, value: string, set: (v: string) => void, error: string)}
	{#if proof === 'password'}
		<PasswordField
			{id}
			name="current-password"
			label={i18n.t('ADMIN_NEXT.PASSKEYS_FIELD.CURRENT_PASSWORD')}
			{value}
			onchange={set}
			policy={null}
			autocomplete="current-password"
			showMeter={false}
			showHint={false}
			invalid={!!error}
			invalidMessage={error}
			disabled={busy}
		/>
	{:else if proof === 'code'}
		<div class="space-y-1.5">
			<label for={id} class="text-xs font-medium text-foreground"
				>{i18n.t('ADMIN_NEXT.PASSKEYS_FIELD.CURRENT_CODE')}</label
			>
			<input
				{id}
				type="text"
				inputmode="numeric"
				autocomplete="one-time-code"
				pattern="[0-9]*"
				maxlength="6"
				placeholder="000000"
				class="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-center font-mono text-sm tracking-[0.3em] shadow-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none {error
					? 'border-red-500 ring-1 ring-red-500/30'
					: 'border-input'}"
				{value}
				oninput={(e) => set((e.currentTarget as HTMLInputElement).value)}
				disabled={busy}
			/>
			{#if error}
				<p class="text-xs text-red-500">{error}</p>
			{/if}
		</div>
	{/if}
{/snippet}

{#if data?.enabled && !loadFailed}
	<div class="rounded-xl border border-border bg-card p-5" data-testid="passkeys-card">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div class="min-w-0 flex-1">
				<h2 class="text-sm font-semibold text-foreground">
					{i18n.t('ADMIN_NEXT.PASSKEYS_FIELD.TITLE')}
				</h2>
				<p class="mt-1 text-xs text-muted-foreground">
					{isSelf
						? i18n.t('ADMIN_NEXT.PASSKEYS_FIELD.HELP')
						: i18n.t('ADMIN_NEXT.PASSKEYS_FIELD.HELP_OTHER')}
				</p>
			</div>
			{#if canManageOwn && addStage !== 'proof'}
				<Button
					size="sm"
					onclick={beginAdd}
					disabled={busy || !supported}
					data-testid="passkey-add"
				>
					{#if addStage === 'waiting'}
						<Loader2 size={13} class="animate-spin" />
						{i18n.t('ADMIN_NEXT.PASSKEYS_FIELD.WAITING')}
					{:else}
						<Plus size={13} />
						{i18n.t('ADMIN_NEXT.PASSKEYS_FIELD.ADD')}
					{/if}
				</Button>
			{/if}
		</div>

		{#if proofUnavailable}
			<p class="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="passkeys-proof-unavailable">
				<Info size={12} class="shrink-0" />
				{i18n.t('ADMIN_NEXT.PASSKEYS_FIELD.PROOF_UNAVAILABLE')}
			</p>
		{/if}

		{#if canManageOwn && !supported}
			<p class="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
				<Info size={12} class="shrink-0" />
				{i18n.t('ADMIN_NEXT.PASSKEYS_FIELD.UNSUPPORTED')}
			</p>
		{/if}

		{#if addStage === 'proof'}
			<form
				class="mt-4 space-y-3 rounded-md border border-border bg-background px-3 py-3"
				onsubmit={submitAddProof}
				novalidate
				data-testid="passkey-add-proof"
			>
				<input
					type="text"
					name="username"
					autocomplete="username"
					value={username}
					hidden
					readonly
				/>
				<p class="text-xs text-foreground">
					{proof === 'code'
						? i18n.t('ADMIN_NEXT.PASSKEYS_FIELD.PROOF_CODE_ADD')
						: i18n.t('ADMIN_NEXT.PASSKEYS_FIELD.PROOF_PASSWORD_ADD')}
				</p>
				{@render proofInput(
					'passkey-add-proof-input',
					addProof,
					(v) => {
						addProof = v;
						if (addError) addError = '';
					},
					addError
				)}
				<div class="flex gap-2">
					<Button type="submit" size="sm" disabled={busy}>
						{#if busy}
							<Loader2 size={13} class="animate-spin" />
						{/if}
						{i18n.t('ADMIN_NEXT.PASSKEYS_FIELD.CONTINUE')}
					</Button>
					<Button type="button" variant="outline" size="sm" onclick={cancelAdd} disabled={busy}>
						{i18n.t('ADMIN_NEXT.CANCEL')}
					</Button>
				</div>
			</form>
		{/if}

		<div class="mt-4">
			{#if data.passkeys.length === 0}
				<p class="py-2 text-sm text-muted-foreground" data-testid="passkeys-empty">
					{isSelf
						? i18n.t('ADMIN_NEXT.PASSKEYS_FIELD.NONE')
						: i18n.t('ADMIN_NEXT.PASSKEYS_FIELD.NONE_OTHER')}
				</p>
			{:else}
				<ul class="divide-y divide-border/60 rounded-lg border border-border">
					{#each data.passkeys as pk (pk.id)}
						<li class="px-3 py-2.5" data-testid="passkey-row">
							{#if renameId === pk.id}
								<form class="flex flex-wrap items-center gap-2" onsubmit={submitRename}>
									<label for="passkey-rename-{pk.id}" class="sr-only"
										>{i18n.t('ADMIN_NEXT.PASSKEYS_FIELD.NAME_LABEL')}</label
									>
									<input
										id="passkey-rename-{pk.id}"
										type="text"
										maxlength={NAME_MAX}
										class="flex h-8 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2.5 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
										bind:value={renameValue}
										onkeydown={renameKeydown}
										disabled={busy}
									/>
									<Button type="submit" size="sm" disabled={busy || renameValue.trim() === ''}>
										{#if busy}
											<Loader2 size={13} class="animate-spin" />
										{/if}
										{i18n.t('ADMIN_NEXT.PASSKEYS_FIELD.SAVE')}
									</Button>
									<Button
										type="button"
										variant="outline"
										size="sm"
										onclick={() => (renameId = null)}
										disabled={busy}
									>
										{i18n.t('ADMIN_NEXT.CANCEL')}
									</Button>
								</form>
							{:else}
								<div class="flex items-center gap-3">
									<KeyRound size={16} class="shrink-0 text-muted-foreground" />
									<div class="min-w-0 flex-1">
										<div class="flex flex-wrap items-center gap-2">
											<span
												class="truncate text-sm font-medium text-foreground"
												data-testid="passkey-name">{pk.name}</span
											>
											{#if pk.synced}
												<span title={i18n.t('ADMIN_NEXT.PASSKEYS_FIELD.SYNCED_HELP')}>
													<Badge variant="secondary"
														>{i18n.t('ADMIN_NEXT.PASSKEYS_FIELD.SYNCED')}</Badge
													>
												</span>
											{/if}
										</div>
										<p class="mt-0.5 text-xs text-muted-foreground">
											{pk.created
												? i18n.t('ADMIN_NEXT.PASSKEYS_FIELD.ADDED_ON', {
														date: formatDate(pk.created)
													})
												: ''}{pk.created ? ' · ' : ''}{pk.last_used
												? i18n.t('ADMIN_NEXT.PASSKEYS_FIELD.LAST_USED', {
														date: formatDate(pk.last_used)
													})
												: i18n.t('ADMIN_NEXT.PASSKEYS_FIELD.NEVER_USED')}
										</p>
									</div>
									{#if removeId !== pk.id}
										<div class="flex shrink-0 items-center gap-1">
											{#if canManageOwn}
												<Button
													variant="ghost"
													size="sm"
													onclick={() => beginRename(pk)}
													disabled={busy}
													data-testid="passkey-rename"
												>
													<Pencil size={13} />
													<span class="hidden sm:inline"
														>{i18n.t('ADMIN_NEXT.PASSKEYS_FIELD.RENAME')}</span
													>
												</Button>
											{/if}
											{#if canManageOwn || canRemoveOther}
												<Button
													variant="ghost"
													size="sm"
													class="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
													onclick={() => beginRemove(pk)}
													disabled={busy}
													data-testid="passkey-remove"
												>
													<Trash2 size={13} />
													<span class="hidden sm:inline"
														>{i18n.t('ADMIN_NEXT.PASSKEYS_FIELD.REMOVE')}</span
													>
												</Button>
											{/if}
										</div>
									{/if}
								</div>

								{#if removeId === pk.id}
									<form
										class="mt-3 space-y-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-3"
										onsubmit={submitRemove}
										novalidate
										data-testid="passkey-remove-confirm"
									>
										{#if isSelf && proof === 'password'}
											<input
												type="text"
												name="username"
												autocomplete="username"
												value={username}
												hidden
												readonly
											/>
										{/if}
										<p class="text-xs text-foreground">
											{#if !isSelf}
												{i18n.t('ADMIN_NEXT.PASSKEYS_FIELD.REMOVE_CONFIRM_OTHER', {
													name: pk.name,
													username
												})}
											{:else if proof === 'password'}
												{i18n.t('ADMIN_NEXT.PASSKEYS_FIELD.REMOVE_CONFIRM_PASSWORD', {
													name: pk.name
												})}
											{:else if proof === 'code'}
												{i18n.t('ADMIN_NEXT.PASSKEYS_FIELD.REMOVE_CONFIRM_CODE', { name: pk.name })}
											{:else}
												{i18n.t('ADMIN_NEXT.PASSKEYS_FIELD.REMOVE_CONFIRM', { name: pk.name })}
											{/if}
										</p>
										{#if isSelf}
											{@render proofInput(
												'passkey-remove-proof-input',
												removeProof,
												(v) => {
													removeProof = v;
													if (removeError) removeError = '';
												},
												removeError
											)}
										{/if}
										<div class="flex gap-2">
											<Button type="submit" variant="destructive" size="sm" disabled={busy}>
												{#if busy}
													<Loader2 size={13} class="animate-spin" />
												{/if}
												{i18n.t('ADMIN_NEXT.PASSKEYS_FIELD.REMOVE')}
											</Button>
											<Button
												type="button"
												variant="outline"
												size="sm"
												onclick={cancelRemove}
												disabled={busy}
											>
												{i18n.t('ADMIN_NEXT.CANCEL')}
											</Button>
										</div>
									</form>
								{/if}
							{/if}
						</li>
					{/each}
				</ul>
			{/if}

			{#if notice}
				<p
					class="mt-3 text-xs {notice.tone === 'warn'
						? 'text-amber-700 dark:text-amber-400'
						: 'text-muted-foreground'}"
					role="status"
					data-testid="passkey-notice"
				>
					{notice.text}
				</p>
			{/if}
		</div>
	</div>
{/if}
