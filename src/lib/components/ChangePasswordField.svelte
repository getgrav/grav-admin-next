<script lang="ts">
	/**
	 * The Password card on a user's page. On your own account it asks for the
	 * current password, then the new one twice; on someone else's (with
	 * api.users.write) just the new one twice. An account with no password yet
	 * (one created by a sign-in service) sets its first without a current one.
	 *
	 * It saves on its own, apart from the account form, so a half-typed
	 * password is never part of the form's dirty state or auto-save.
	 */
	import { i18n } from '$lib/stores/i18n.svelte';
	import { updateUser, type UserInfo } from '$lib/api/endpoints/users';
	import { auth } from '$lib/stores/auth.svelte';
	import { passwordPolicy } from '$lib/stores/passwordPolicy.svelte';
	import { evaluatePassword } from '$lib/utils/passwordStrength';
	import PasswordField from '$lib/components/ui/PasswordField.svelte';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import { Loader2 } from 'lucide-svelte';

	interface Props {
		user: UserInfo;
		/** True when this is the signed-in user's own account. */
		isSelf: boolean;
		/** Called with the saved user and its new ETag. */
		onchanged?: (user: UserInfo, etag: string) => void;
		/** Told when a save starts and ends, so the page can skip its own update echo. */
		onsavingchange?: (saving: boolean) => void;
	}

	let { user, isSelf, onchanged, onsavingchange }: Props = $props();

	let current = $state('');
	let next = $state('');
	let confirm = $state('');
	let saving = $state(false);
	// Field errors show once a change has been tried, and clear as you type.
	let errors = $state<{ current?: string; next?: string; confirm?: string }>({});

	// Older API plugins don't send has_password; treat the account as having one.
	const needsCurrent = $derived(isSelf && user.has_password !== false);
	const name = $derived(user.fullname || user.username);
	const policyResult = $derived(evaluatePassword(next, passwordPolicy.current));
	const canSubmit = $derived(
		!saving && next !== '' && confirm !== '' && (!needsCurrent || current !== '')
	);

	$effect(() => {
		passwordPolicy.load().catch(() => {});
	});

	function clearError(field: 'current' | 'next' | 'confirm') {
		if (errors[field]) errors = { ...errors, [field]: undefined };
	}

	function validate(): boolean {
		const found: typeof errors = {};
		if (needsCurrent && current === '')
			found.current = i18n.t('ADMIN_NEXT.USERS.PASSWORD.CURRENT_REQUIRED');
		if (next === '') found.next = i18n.t('ADMIN_NEXT.USERS.PASSWORD.NEW_REQUIRED');
		else if (passwordPolicy.current && !policyResult.allRulesMet)
			found.next = i18n.t('ADMIN_NEXT.USERS.PASSWORD.POLICY');
		if (next !== '' && confirm !== next)
			found.confirm = i18n.t('ADMIN_NEXT.USERS.PASSWORD.MISMATCH');
		errors = found;
		return Object.keys(found).length === 0;
	}

	/** The server's field errors from a 422, keyed by field name. */
	function fieldErrors(err: unknown): Record<string, string> {
		const list =
			(err as { error?: { errors?: { field?: string; message?: string }[] } })?.error?.errors ?? [];
		const out: Record<string, string> = {};
		for (const e of list) if (e.field) out[e.field] = e.message ?? '';
		return out;
	}

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (saving || !validate()) return;

		saving = true;
		onsavingchange?.(true);
		try {
			const body: Record<string, unknown> = { password: next };
			if (needsCurrent) body.current_password = current;
			// No If-Match: a new password doesn't clash with edits to other fields.
			const result = await updateUser(user.username, body);

			// Changing your own password ends the token this tab signed in with;
			// the API sends a fresh pair so the session carries on.
			const tokens = (
				result.meta as
					| { tokens?: { access_token?: string; refresh_token?: string; expires_in?: number } }
					| undefined
			)?.tokens;
			if (isSelf && tokens?.access_token && tokens.refresh_token) {
				auth.setTokens(tokens.access_token, tokens.refresh_token, tokens.expires_in ?? 3600);
			}

			current = '';
			next = '';
			confirm = '';
			errors = {};
			onchanged?.(result.user, result.etag);
			toast.success(
				isSelf
					? i18n.t('ADMIN_NEXT.USERS.PASSWORD.CHANGED_OWN')
					: i18n.t('ADMIN_NEXT.USERS.PASSWORD.CHANGED_OTHER', { name })
			);
		} catch (err: unknown) {
			const status = (err as { status?: number })?.status ?? 0;
			const fields = status === 422 ? fieldErrors(err) : {};
			if ('current_password' in fields) {
				// The form already checks it's filled in, so this is a wrong one.
				errors = { current: i18n.t('ADMIN_NEXT.USERS.PASSWORD.CURRENT_WRONG') };
				current = '';
			} else if ('password' in fields) {
				errors = { next: fields.password || i18n.t('ADMIN_NEXT.USERS.PASSWORD.POLICY') };
			} else if (status === 429) {
				toast.error(i18n.t('ADMIN_NEXT.USERS.PASSWORD.TOO_MANY'));
			} else if (status === 403) {
				toast.error(i18n.t('ADMIN_NEXT.USERS.PASSWORD.NOT_ALLOWED'));
			} else {
				toast.error(i18n.t('ADMIN_NEXT.USERS.PASSWORD.FAILED'));
			}
		} finally {
			saving = false;
			onsavingchange?.(false);
		}
	}
</script>

{#snippet row(id: string, label: string)}
	<label for={id} class="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
		{label}
	</label>
{/snippet}

<!-- Laid out like the blueprint sections around it (SectionField): the same card,
     title and label-left, field-right rows, with fields at the `large` width the
     account blueprint gives its password field. -->
<form class="rounded-xl border border-border bg-muted/30" onsubmit={handleSubmit} novalidate>
	<!-- A username field lets password managers tell which account the new password is for. -->
	<input
		type="text"
		name="username"
		autocomplete="username"
		value={user.username}
		hidden
		readonly
	/>

	<div class="px-6 pt-6 pb-2">
		<h3 class="text-base font-bold text-foreground">
			{i18n.t('ADMIN_NEXT.USERS.PASSWORD.TITLE')}
		</h3>
		<p class="mt-1 text-sm text-muted-foreground">
			{#if !isSelf}
				{i18n.t('ADMIN_NEXT.USERS.PASSWORD.OTHER_HELP', { name })}
			{:else if needsCurrent}
				{i18n.t('ADMIN_NEXT.USERS.PASSWORD.OWN_HELP')}
			{:else}
				{i18n.t('ADMIN_NEXT.USERS.PASSWORD.NO_PASSWORD_HELP')}
			{/if}
		</p>
	</div>

	<div class="space-y-5 px-6 py-5">
		{#if needsCurrent}
			<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_2fr] lg:items-start lg:gap-x-6">
				<div class="flex items-start gap-2 lg:pt-2.5">
					{@render row('current-password', i18n.t('ADMIN_NEXT.USERS.PASSWORD.CURRENT'))}
				</div>
				<div class="max-w-[28rem]">
					<PasswordField
						id="current-password"
						name="current-password"
						label=""
						value={current}
						onchange={(v) => {
							current = v;
							clearError('current');
						}}
						policy={null}
						autocomplete="current-password"
						showMeter={false}
						showHint={false}
						invalid={!!errors.current}
						invalidMessage={errors.current}
						disabled={saving}
					/>
				</div>
			</div>
		{/if}
		<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_2fr] lg:items-start lg:gap-x-6">
			<div class="flex items-start gap-2 lg:pt-2.5">
				{@render row('new-password', i18n.t('ADMIN_NEXT.USERS.PASSWORD.NEW'))}
			</div>
			<div class="max-w-[28rem]">
				<PasswordField
					id="new-password"
					name="new-password"
					label=""
					value={next}
					onchange={(v) => {
						next = v;
						clearError('next');
					}}
					policy={passwordPolicy.current}
					autocomplete="new-password"
					invalid={!!errors.next}
					invalidMessage={errors.next}
					disabled={saving}
				/>
			</div>
		</div>
		<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_2fr] lg:items-start lg:gap-x-6">
			<div class="flex items-start gap-2 lg:pt-2.5">
				{@render row('confirm-password', i18n.t('ADMIN_NEXT.USERS.PASSWORD.CONFIRM'))}
			</div>
			<div class="max-w-[28rem]">
				<PasswordField
					id="confirm-password"
					name="confirm-password"
					label=""
					value={confirm}
					onchange={(v) => {
						confirm = v;
						clearError('confirm');
					}}
					policy={null}
					autocomplete="new-password"
					showMeter={false}
					showHint={false}
					invalid={!!errors.confirm}
					invalidMessage={errors.confirm}
					disabled={saving}
				/>
			</div>
		</div>
		<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_2fr] lg:gap-x-6">
			<div class="max-lg:hidden"></div>
			<div>
				<Button type="submit" size="sm" disabled={!canSubmit}>
					{#if saving}
						<Loader2 size={14} class="me-1.5 animate-spin" />
					{/if}
					{isSelf && needsCurrent
						? i18n.t('ADMIN_NEXT.USERS.PASSWORD.CHANGE')
						: i18n.t('ADMIN_NEXT.USERS.PASSWORD.SET')}
				</Button>
			</div>
		</div>
	</div>
</form>
