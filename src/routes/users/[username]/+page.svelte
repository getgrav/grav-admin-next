<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { setContext } from 'svelte';
	import { provideFormCommit } from '$lib/utils/form-commit.svelte';
	import { getUser, updateUser, deleteUser, cancelEmailChange, resendEmailChange, type UserInfo } from '$lib/api/endpoints/users';
	import { emailChangeRefusal, metaMessage } from '$lib/utils/email-change';
	import { getGroups, type GroupInfo } from '$lib/api/endpoints/groups';
	import { getUserBlueprint } from '$lib/api/endpoints/blueprints';
	import type { BlueprintSchema } from '$lib/api/endpoints/blueprints';
	import BlueprintForm from '$lib/components/blueprint/BlueprintForm.svelte';
	import { checkRequiredOrToast, scrollToFirstError, validateFieldAt, stableJson, pruneEmpty } from '$lib/utils/blueprint-validation';
	import { resolveInheritedAccess, toAccessRecord } from '$lib/utils/user-access';
	import PermissionsField from '$lib/components/PermissionsField.svelte';
	import TwoFactorField from '$lib/components/TwoFactorField.svelte';
	import ApiKeysField from '$lib/components/ApiKeysField.svelte';
	import ChangePasswordField from '$lib/components/ChangePasswordField.svelte';
	import ConfirmPasswordModal from '$lib/components/ConfirmPasswordModal.svelte';
	import UserAvatarCard from '$lib/components/UserAvatarCard.svelte';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import UnsavedChangesModal from '$lib/components/ui/UnsavedChangesModal.svelte';
	import UnsavedIndicator from '$lib/components/ui/UnsavedIndicator.svelte';
	import { Button } from '$lib/components/ui/button';
	import StickyHeader from '$lib/components/ui/StickyHeader.svelte';
	import { toast } from 'svelte-sonner';
	import { auth } from '$lib/stores/auth.svelte';
	import { prefs } from '$lib/stores/preferences.svelte';
	import { createAutoSaveManager } from '$lib/utils/auto-save.svelte';
	import { createUnsavedGuard } from '$lib/utils/unsaved-guard.svelte';
	import { invalidations } from '$lib/stores/invalidation.svelte';
	import { onMount } from 'svelte';
	import {
		Save, Loader2, AlertCircle, Trash2, User, Undo2, Mail, LockKeyhole
	} from 'lucide-svelte';
	import DirectionalIcon from '$lib/components/ui/DirectionalIcon.svelte';
	import { canWrite } from '$lib/utils/permissions';
	import AccessDenied from '$lib/components/ui/AccessDenied.svelte';

	const canEditUsers = $derived(canWrite('users'));
	const isSelf = $derived(page.params.username === auth.username);
	// Self-edit is permitted by the API with just api.access — sensitive
	// fields (state, access) are filtered server-side, so editing your own
	// profile shouldn't require api.users.write.
	const canSave = $derived(canEditUsers || isSelf);
	// Permissions and the account-state toggle are governance fields. Render
	// the form without them when the current user can't manage users —
	// they'd 403 server-side anyway, and showing them is misleading.
	const canManagePermissions = $derived(canEditUsers);
	let accessDenied = $state(false);

	const REDACTED = '********';

	// Fields handled outside the blueprint form or not renderable in admin-next
	const SUPPRESSED_TYPES = new Set(['permissions', 'userinfo', '2fa_secret', 'api_keys']);

	const username = $derived(page.params.username ?? '');
	// Scope for blueprint-upload destination resolution (e.g. avatar field).
	setContext('blueprintScope', () => username ? 'users/' + username : '');
	// Bus for leaf fields that defer side effects to the save commit.
	const formCommit = provideFormCommit();

	let user = $state<UserInfo | null>(null);
	let blueprint = $state<BlueprintSchema | null>(null);
	let etag = $state('');
	let loading = $state(true);
	let saving = $state(false);
	let deleting = $state(false);
	let error = $state('');
	let confirmDeleteOpen = $state(false);
	// True while Resend or Cancel for a waiting email change is in flight.
	let emailChangeBusy = $state(false);
	// True while the Password card is saving.
	let passwordBusy = $state(false);
	// Open while a save that changes your own email waits for your current password.
	let emailConfirmOpen = $state(false);
	// The address typed when that dialog was cancelled. Until it is confirmed (or
	// changed), auto-save keeps it typed in the form and saves the other fields
	// without it.
	let declinedEmail = $state<string | null>(null);

	// Form data from blueprint fields
	let configData = $state<Record<string, unknown>>({});
	let validationErrors = $state<Record<string, string>>({});
	let originalJson = $state('{}');

	// Permissions handled separately
	let access = $state<Record<string, unknown>>({});
	let originalAccessJson = $state('{}');

	// All groups (for resolving the read-only inheritance overlay). The overlay
	// reacts to the live `groups` membership field, so editing membership in the
	// form updates the ghosted toggles immediately.
	let allGroups = $state<GroupInfo[]>([]);
	const inheritedAccess = $derived(
		resolveInheritedAccess(((configData.groups as string[]) ?? []), allGroups),
	);

	// Your own new email address needs your current password (API 1.1.4). Not
	// asked of an admin editing someone else, or of an account with no password
	// yet (older API plugins don't send has_password; treat it as having one).
	const normalizeEmail = (v: unknown) => String(v ?? '').trim().toLowerCase();
	const typedEmail = $derived(String(configData.email ?? ''));
	const emailNeedsPassword = $derived(
		isSelf && !!user && user.has_password !== false
			&& normalizeEmail(typedEmail) !== normalizeEmail(user.email),
	);
	// The new address is still only typed in: its dialog was cancelled.
	const emailWaitingForPassword = $derived(emailNeedsPassword && declinedEmail === typedEmail);

	const hasChanges = $derived(
		stableJson(configData) !== originalJson ||
		(canManagePermissions && stableJson(access) !== originalAccessJson)
	);

	// Names of fields/sections handled manually outside the blueprint form.
	// `language` (the user blueprint's site content language picker) is hidden
	// in admin-next because it duplicates the user-level admin UI language
	// setting visible in Settings → Admin Language, and the two concepts
	// being side-by-side confuses authors. Classic admin still shows the
	// field, so the underlying yaml shape is unchanged.
	const SUPPRESSED_NAMES = new Set(['security', 'twofa_check', 'avatar', 'multiavatar_only', 'api_check', 'api_section', 'language']);

	// Recursively filter out suppressed field types and named sections from blueprint
	function filterFields(fields: BlueprintSchema['fields']): BlueprintSchema['fields'] {
		return fields
			.filter((f) => {
				if (SUPPRESSED_TYPES.has(f.type)) return false;
				if (SUPPRESSED_NAMES.has(f.name)) return false;
				// No Status select on your own account: the API refuses to let you
				// disable yourself (api#49). The unchanged value still goes back on save.
				if (isSelf && f.name === 'state') return false;
				// The account's own password field gives way to the Password card,
				// which asks for the current password on your own account and
				// saves apart from the form.
				if (f.name === 'password' && f.type === 'password') return false;
				return true;
			})
			.map((f) => {
				if (f.fields) {
					return { ...f, fields: filterFields(f.fields) };
				}
				return f;
			});
	}

	const filteredBlueprint = $derived.by(() => {
		if (!blueprint) return null;
		return {
			...blueprint,
			fields: filterFields(blueprint.fields),
		};
	});

	// The account blueprint nests `groups` inside the `security` section, which
	// we suppress wholesale (its other child, `access`, is rendered by the
	// dedicated PermissionsField). Extract just the groups field so we can place
	// it at the top of the Access Levels card, matching classic admin's layout.
	// Two tweaks make it round-trip correctly through the selectize renderer:
	//  - `store_keys` so the stored value is the group key (e.g. `procras`), not
	//    its readable label — group membership is keyed by name.
	//  - drop the `commalist` validate type so the field emits an array rather
	//    than a comma-joined string; the API stores it verbatim as `groups: []`.
	function findGroupsField(fields: BlueprintSchema['fields']): BlueprintSchema['fields'][number] | null {
		for (const f of fields) {
			if (f.name === 'groups') return f;
			if (f.fields) {
				const found = findGroupsField(f.fields);
				if (found) return found;
			}
		}
		return null;
	}

	const groupsField = $derived.by(() => {
		if (!blueprint) return null;
		const field = findGroupsField(blueprint.fields);
		if (!field) return null;
		const { type: _validateType, ...restValidate } = (field.validate ?? {}) as Record<string, unknown>;
		return {
			...field,
			selectize: { ...(field.selectize as Record<string, unknown> ?? {}), store_keys: true },
			validate: restValidate,
		} as BlueprintSchema['fields'][number];
	});

	function populateForm(u: UserInfo) {
		// Start from whatever the API returned so a site's own account fields —
		// added by extending user/blueprints/user/account.yaml — reach the form
		// instead of redrawing empty after every save (admin2#138). The built-in
		// fields are then normalized explicitly below.
		//
		// Dropped here: `access` has its own permissions editor, twofa_enabled is
		// managed by the dedicated 2FA enroll/disable endpoints rather than the
		// user PATCH (omitting it keeps dirty tracking accurate), and the rest are
		// read-only server metadata that no blueprint field binds to.
		const {
			access: _access,
			avatar_url: _avatarUrl,
			twofa_enabled: _twofaEnabled,
			twofa_secret: _twofaSecret,
			twofa_global_enabled: _twofaGlobalEnabled,
			has_password: _hasPassword,
			created: _created,
			modified: _modified,
			extra: _extra,
			...custom
		} = u as unknown as Record<string, unknown>;
		// A waiting email change is shown under the email field, not edited in
		// the form, so it stays out of the data a save sends back.
		delete custom.email_pending;

		configData = {
			...custom,
			username: u.username,
			email: u.email ?? '',
			fullname: u.fullname ?? '',
			title: u.title ?? '',
			state: u.state,
			language: custom.language ?? '',
			content_editor: custom.content_editor ?? '',
			// Group membership (admin.super governance field). Stored as an array
			// of group keys — matches classic admin's on-disk `groups: [key]`.
			groups: u.groups ?? [],
		};
		originalJson = stableJson(configData);

		access = structuredClone(toAccessRecord(u.access));
		originalAccessJson = stableJson(access);
	}

	async function loadUser() {
		loading = true;
		error = '';
		accessDenied = false;
		try {
			const [userResult, blueprintResult, groupsResult] = await Promise.all([
				getUser(username),
				getUserBlueprint().catch(() => null),
				// Groups feed the read-only permission-inheritance overlay; failure
				// there shouldn't block editing the user, so swallow it.
				getGroups(1, 500).catch(() => null),
			]);

			user = userResult.user;
			etag = userResult.etag;
			blueprint = blueprintResult;
			allGroups = groupsResult?.groups ?? [];
			populateForm(userResult.user);
		} catch (err: unknown) {
			const status = err && typeof err === 'object' && 'status' in err
				? (err as { status: number }).status : 0;
			if (status === 403) {
				accessDenied = true;
			} else {
				error = `Failed to load user '${username}'.`;
			}
		} finally {
			loading = false;
		}
	}

	function handleBlueprintChange(path: string, value: unknown) {
		const parts = path.split('.');
		const newData = { ...configData };
		let current: Record<string, unknown> = newData;

		for (let i = 0; i < parts.length - 1; i++) {
			const key = parts[i];
			if (typeof current[key] !== 'object' || current[key] === null) {
				current[key] = {};
			} else {
				current[key] = { ...(current[key] as Record<string, unknown>) };
			}
			current = current[key] as Record<string, unknown>;
		}
		current[parts[parts.length - 1]] = value;
		configData = newData;

		// Re-check this field now it's been touched: flag it if a required field was
		// cleared, clear the flag once it's filled again (admin2#34).
		const err = filteredBlueprint ? validateFieldAt(filteredBlueprint.fields, path, newData) : null;
		if (err) {
			validationErrors = { ...validationErrors, [path]: err };
		} else if (validationErrors[path]) {
			const { [path]: _cleared, ...rest } = validationErrors;
			validationErrors = rest;
		}
	}

	function stripRedacted(obj: unknown): unknown {
		if (typeof obj === 'string') return obj === REDACTED ? undefined : obj;
		if (Array.isArray(obj)) return obj.map(stripRedacted);
		if (obj && typeof obj === 'object') {
			const result: Record<string, unknown> = {};
			for (const [key, value] of Object.entries(obj)) {
				const stripped = stripRedacted(value);
				if (stripped !== undefined) result[key] = stripped;
			}
			return result;
		}
		return obj;
	}

	/**
	 * Save the account form. A save that changes your own email address asks
	 * for your current password first, in a dialog, and nothing is sent until
	 * it's confirmed. An auto-save asks too, unless that dialog was already
	 * cancelled for the address typed: then it saves the other fields and leaves
	 * the new address waiting in the form. The Save button and Ctrl/Cmd+S
	 * always ask.
	 */
	async function handleSave(opts: { auto?: boolean } = {}) {
		// Block the save if any required field is empty (admin2#30).
		validationErrors = filteredBlueprint ? checkRequiredOrToast(filteredBlueprint.fields, configData) : {};
		if (Object.keys(validationErrors).length > 0) {
			scrollToFirstError();
			return;
		}

		let skipEmail = false;
		if (emailNeedsPassword) {
			if (opts.auto && emailWaitingForPassword) {
				skipEmail = true;
			} else {
				emailConfirmOpen = true;
				return;
			}
		}

		saving = true;
		try {
			await submitSave({ skipEmail });
		} catch (err: unknown) {
			reportSaveError(err);
		} finally {
			saving = false;
		}
	}

	/** The dialog's Confirm: the save, with the current password it was given. */
	async function confirmEmailChange(currentPassword: string): Promise<string | null> {
		saving = true;
		try {
			await submitSave({ currentPassword });
			emailConfirmOpen = false;
			declinedEmail = null;
			return null;
		} catch (err: unknown) {
			const status = (err as { status?: number })?.status ?? 0;
			// A wrong password, or too many of them, is answered in the dialog.
			if (status === 422) {
				const field = ((err as { error?: { errors?: { field?: string; message?: string }[] } })
					?.error?.errors ?? []).find((e) => e.field === 'current_password');
				if (field) return field.message || i18n.t('ADMIN_NEXT.USERS.PASSWORD.CURRENT_WRONG');
			}
			if (status === 429) {
				return emailChangeRefusal(err) ?? i18n.t('ADMIN_NEXT.USERS.PASSWORD.TOO_MANY');
			}
			emailConfirmOpen = false;
			reportSaveError(err);
			return null;
		} finally {
			saving = false;
		}
	}

	function cancelEmailConfirm() {
		emailConfirmOpen = false;
		declinedEmail = typedEmail;
	}

	function reportSaveError(err: unknown) {
		if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 409) {
			toast.error(i18n.t('ADMIN_NEXT.USERS.USER_WAS_MODIFIED_ELSEWHERE_PLEASE'));
		} else {
			// A taken address (422) or too many changes (429) comes with its own sentence.
			toast.error(emailChangeRefusal(err) ?? i18n.t('ADMIN_NEXT.USERS.FAILED_TO_SAVE_USER'));
		}
	}

	/**
	 * Send the form. Throws on a refusal, with nothing saved. `currentPassword`
	 * goes in the request body only; `skipEmail` leaves the address out and puts
	 * the typed one back in the form afterwards, so it stays unsaved.
	 */
	async function submitSave({ currentPassword, skipEmail = false }: { currentPassword?: string; skipEmail?: boolean }) {
		const cleaned = stripRedacted(configData) as Record<string, unknown>;
		// Merge blueprint data with access permissions. Prune empty branches
		// so any legacy `{api:{pages:{}}}` pollution is cleaned on save
		// (admin2#50).
		const body: Record<string, unknown> = {
			...cleaned,
			access: pruneEmpty(access),
		};
		// Don't send username (readonly) or empty password
		delete body.username;
		if (!body.password || body.password === '') {
			delete body.password;
		}
		// Governance fields require api.users.write server-side. The API
		// rejects the whole request if these keys are present (regardless
		// of whether the values changed), so omit them entirely when the
		// caller can't manage users.
		if (!canManagePermissions) {
			delete body.access;
			delete body.state;
			// `groups` is super-admin-only server-side; sending the
			// (unchanged) value would 403 a non-super self-edit.
			delete body.groups;
		}
		const keptEmail = typedEmail;
		if (skipEmail) delete body.email;
		if (currentPassword !== undefined) body.current_password = currentPassword;

		const pendingBefore = user?.email_pending ?? '';
		const result = await updateUser(username, body, etag);
		user = result.user;
		etag = result.etag;
		populateForm(result.user);
		if (skipEmail) configData = { ...configData, email: keptEmail };

		// If editing your own account, update auth store
		if (username === auth.username) {
			auth.setUser(
				username,
				result.user.fullname || username,
				result.user.email || '',
				result.user.avatar_url || '',
				result.user.content_editor,
			);
		}

		await formCommit.emit();
		toast.success(i18n.t('ADMIN_NEXT.TOASTS.USER_SAVED', { username }));

		// A new address for your own account waits for the link mailed to it.
		// The response still carries the old address, so the form just went back
		// to it; say why, or the typed address would seem to have been dropped.
		const newlyPending = result.user.email_pending && result.user.email_pending !== pendingBefore
			? result.user.email_pending : '';
		const emailMessage = metaMessage(result.meta)
			?? (newlyPending ? i18n.t('ADMIN_NEXT.USERS.EMAIL_CHANGE_SENT', { email: newlyPending }) : '');
		if (emailMessage) toast.info(emailMessage, { duration: 10000 });
	}

	// Resend and Cancel for a waiting email change. They return the user, so the
	// notice updates without reloading and without touching edits in the form.
	async function handleResendEmailChange() {
		if (!user || emailChangeBusy) return;
		emailChangeBusy = true;
		try {
			const result = await resendEmailChange(username);
			user = result.user;
			etag = result.etag || etag;
			toast.info(
				metaMessage(result.meta) ?? i18n.t('ADMIN_NEXT.USERS.EMAIL_CHANGE_SENT', { email: result.user.email_pending ?? '' }),
				{ duration: 10000 },
			);
		} catch (err: unknown) {
			toast.error(emailChangeRefusal(err) ?? i18n.t('ADMIN_NEXT.USERS.EMAIL_CHANGE_RESEND_FAILED'));
		} finally {
			emailChangeBusy = false;
		}
	}

	async function handleCancelEmailChange() {
		if (!user || emailChangeBusy) return;
		emailChangeBusy = true;
		try {
			const result = await cancelEmailChange(username);
			user = result.user;
			etag = result.etag || etag;
			toast.success(i18n.t('ADMIN_NEXT.USERS.EMAIL_CHANGE_CANCELLED'));
		} catch (err: unknown) {
			toast.error(emailChangeRefusal(err) ?? i18n.t('ADMIN_NEXT.USERS.EMAIL_CHANGE_CANCEL_FAILED'));
		} finally {
			emailChangeBusy = false;
		}
	}

	function handleDelete() {
		if (!user) return;
		if (user.username === auth.username) {
			toast.error(i18n.t('ADMIN_NEXT.USERS.YOU_CANNOT_DELETE_YOUR_OWN_ACCOUNT'));
			return;
		}
		confirmDeleteOpen = true;
	}

	async function confirmDelete() {
		confirmDeleteOpen = false;
		deleting = true;
		try {
			await deleteUser(username);
			toast.success(i18n.t('ADMIN_NEXT.TOASTS.USER_DELETED', { username }));
			goto(`${base}/users`);
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.TOASTS.USER_DELETE_FAILED', { username }));
		} finally {
			deleting = false;
		}
	}

	function handleAccessChange(newAccess: Record<string, unknown>) {
		access = newAccess;
	}

	function handleAvatarUpdated(updated: UserInfo) {
		user = updated;
	}

	function handleKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 's') {
			e.preventDefault();
			// Saving by hand always asks for the password a new email address
			// needs, so it goes straight to handleSave rather than auto-save.
			if (prefs.autoSaveEnabled && !emailNeedsPassword) autoSave.forceSave();
			else if (hasChanges && !saving && !emailConfirmOpen) handleSave();
		}
		if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey && prefs.autoSaveEnabled) {
			const tag = (document.activeElement?.tagName ?? '').toLowerCase();
			const isEditable = tag === 'input' || tag === 'textarea' || (document.activeElement as HTMLElement)?.isContentEditable;
			if (!isEditable) {
				e.preventDefault();
				autoSave.undo();
			}
		}
	}

	const guard = createUnsavedGuard(() => {
		if (prefs.autoSaveEnabled) {
			return hasChanges || autoSave.saving || autoSave.undoStack.some(e => !e.savedToServer);
		}
		return hasChanges;
	});

	const autoSave = createAutoSaveManager({
		save: () => handleSave({ auto: true }),
		getValue: (path: string) => {
			const parts = path.split('.');
			let current: unknown = configData;
			for (const part of parts) {
				if (current === null || current === undefined || typeof current !== 'object') return undefined;
				current = (current as Record<string, unknown>)[part];
			}
			return current;
		},
		applyChange: handleBlueprintChange,
		formName: i18n.t('ADMIN_NEXT.TOASTS.FORM_LABEL.USER'),
	});

	$effect(() => {
		username; // track
		autoSave.reset();
		loadUser();
	});

	// Refetch when this user is updated elsewhere (with dirty guard).
	onMount(() => {
		const unsub = invalidations.subscribe('users:update', (e) => {
			if (e.id !== username) return;
			if (!hasChanges) loadUser();
			else toast.info(i18n.t('ADMIN_NEXT.USERS.USER_CHANGED_ELSEWHERE_SAVE_TO'));
		}, {
			// Skip self-echo: our own PATCH emits this same event before handleSave
			// has cleared hasChanges, which would otherwise toast on every save.
			// Resend, Cancel and the Password card emit it too, and update the
			// user themselves.
			dirtyGuard: () => saving || autoSave.saving || emailChangeBusy || passwordBusy,
		});
		return () => { unsub(); };
	});
</script>

{#snippet emailChangeNotice()}
	{#if emailWaitingForPassword}
		<!-- A new address for your own account that isn't saved yet: the
		     password dialog was cancelled. Confirm opens it again. -->
		<div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs dark:border-amber-700/60 dark:bg-amber-950/30">
			<LockKeyhole size={14} class="shrink-0 text-amber-700 dark:text-amber-300" />
			<p class="min-w-0 flex-1 break-all text-amber-900 dark:text-amber-200">
				{i18n.t('ADMIN_NEXT.USERS.EMAIL_CONFIRM.NOT_SAVED', { email: typedEmail.trim() })}
			</p>
			<Button variant="outline" size="sm" class="shrink-0" onclick={() => handleSave()} disabled={saving}>
				{i18n.t('ADMIN_NEXT.CONFIRM')}
			</Button>
		</div>
	{/if}
	{#if user?.email_pending}
		<!-- A new address that is waiting for the link mailed to it. Resend and
		     Cancel are the account owner's own, so anyone else editing this user
		     only sees the notice. -->
		<div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs dark:border-amber-700/60 dark:bg-amber-950/30">
			<Mail size={14} class="shrink-0 text-amber-700 dark:text-amber-300" />
			<p class="min-w-0 flex-1 break-all text-amber-900 dark:text-amber-200">
				{i18n.t('ADMIN_NEXT.USERS.EMAIL_CHANGE_WAITING', { email: user.email_pending })}
			</p>
			{#if isSelf}
				<div class="flex shrink-0 items-center gap-2">
					<Button variant="outline" size="sm" onclick={handleResendEmailChange} disabled={emailChangeBusy}>
						{i18n.t('ADMIN_NEXT.USERS.EMAIL_CHANGE_RESEND')}
					</Button>
					<Button variant="ghost" size="sm" onclick={handleCancelEmailChange} disabled={emailChangeBusy}>
						{i18n.t('ADMIN_NEXT.CANCEL')}
					</Button>
				</div>
			{/if}
		</div>
	{/if}
{/snippet}

<svelte:head>
	<title>{i18n.t('ADMIN_NEXT.USERS.PAGE_TITLE', { name: user?.fullname ?? username })}</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="flex h-full flex-col">
	<!-- Header -->
	<StickyHeader>
		{#snippet children({ scrolled })}
			<div class="px-6 transition-[padding] duration-200 {scrolled ? 'py-2' : 'pt-6 pb-3'}">
				<div class="flex items-center justify-between gap-4 {scrolled ? 'min-h-6' : 'min-h-8'}">
					<div class="flex min-w-0 items-center gap-3">
						<button
							type="button"
							class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
							onclick={() => goto(`${base}/users`)}
						>
							<DirectionalIcon name="arrow-back" size={16} />
						</button>
						{#if user}
							<div class="flex items-center gap-3">
								{#if !scrolled}
									<div class="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
										<User size={16} />
									</div>
								{/if}
								<div class="min-w-0">
									<h1 class="truncate font-semibold text-foreground transition-[font-size] duration-200 {scrolled ? 'text-sm' : 'text-lg'}">{user.fullname || user.username}</h1>
									{#if !scrolled}
										<p class="text-xs text-muted-foreground">@{user.username}</p>
									{/if}
								</div>
							</div>
						{/if}
					</div>

					<div class="flex shrink-0 items-center gap-2">
						<UnsavedIndicator
							hasChanges={hasChanges}
							saving={autoSave.saving}
							lastSavedAt={autoSave.lastSavedAt}
							autoSaveEnabled={prefs.autoSaveEnabled}
						/>
						{#if prefs.autoSaveEnabled && prefs.autoSaveToolbarUndo && autoSave.canUndo}
							<Button variant="outline" size="sm" onclick={() => autoSave.undo()}>
								<Undo2 size={14} />
								Undo
							</Button>
						{/if}
						{#if user && canEditUsers && !isSelf}
							<Button
								variant="destructive"
								size="sm"
								onclick={handleDelete}
								disabled={deleting}
								aria-label={i18n.t('ADMIN_NEXT.DELETE')}
								title={i18n.t('ADMIN_NEXT.DELETE')}
							>
								{#if deleting}
									<Loader2 size={14} class="sm:me-1.5 animate-spin" />
								{:else}
									<Trash2 size={14} class="sm:me-1.5" />
								{/if}
								<span class="hidden sm:inline">{i18n.t('ADMIN_NEXT.DELETE')}</span>
							</Button>
						{/if}
						{#if user && canSave}
							<Button
								size="sm"
								onclick={() => handleSave()}
								disabled={!hasChanges || saving}
								aria-label="Save"
								title="Save"
							>
								{#if saving}
									<Loader2 size={14} class="sm:me-1.5 animate-spin" />
								{:else}
									<Save size={14} class="sm:me-1.5" />
								{/if}
								<span class="hidden sm:inline">Save</span>
							</Button>
						{/if}
					</div>
				</div>
			</div>
		{/snippet}
	</StickyHeader>

	<!-- Content -->
	{#if loading}
		<div class="flex flex-1 items-center justify-center">
			<Loader2 size={24} class="animate-spin text-muted-foreground" />
		</div>
	{:else if accessDenied}
		<div class="px-6 py-4">
			<AccessDenied message="You don't have permission to view this user." />
		</div>
	{:else if error}
		<div class="flex flex-1 items-center justify-center">
			<div class="text-center">
				<AlertCircle size={32} class="mx-auto text-destructive" />
				<p class="mt-2 text-sm text-destructive">{error}</p>
				<Button variant="outline" size="sm" class="mt-3" onclick={() => goto(`${base}/users`)}>
					{i18n.t('ADMIN_NEXT.USERS.BACK_TO_USERS')}
				</Button>
			</div>
		</div>
	{:else if user}
		<div class="flex-1 overflow-y-auto">
			<div class="space-y-6 px-6 py-6">
				<!-- Avatar card -->
				<UserAvatarCard {user} onupdated={handleAvatarUpdated} />

				<!-- Blueprint-driven account fields -->
				{#if filteredBlueprint && filteredBlueprint.fields.length > 0}
					<BlueprintForm
						fields={filteredBlueprint.fields}
						data={configData}
						onchange={handleBlueprintChange}
						oncommit={autoSave.oncommit}
						errors={validationErrors}
						notices={user.email_pending || emailWaitingForPassword ? { email: emailChangeNotice } : {}}
					/>
				{/if}

				<!-- Password — your own needs the current one; someone else's needs
				     api.users.write. Saves on its own, apart from the form above. -->
				{#if isSelf || canEditUsers}
					<ChangePasswordField
						{user}
						{isSelf}
						onsavingchange={(busy) => { passwordBusy = busy; }}
						onchanged={(updated, newEtag) => {
							// Only the user and its ETag: edits waiting in the form stay.
							user = updated;
							if (newEtag) etag = newEtag;
						}}
					/>
				{/if}

				<!-- 2FA Section — only shown when 2FA is globally enabled. If the
				     admin hasn't enabled 2FA site-wide, per-user enrollment is
				     meaningless (the login endpoint won't challenge), so we hide
				     the whole section to avoid a confusing dead-end. -->
				{#if user && user.twofa_global_enabled}
					<div class="rounded-xl border border-border bg-card p-5">
						<h2 class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.USERS.2_FACTOR_AUTHENTICATION')}</h2>
						<div class="mt-4">
							<TwoFactorField
								username={user.username}
								twofaEnabled={user.twofa_enabled}
								hasSecret={user.twofa_secret}
								isAdminActor={user.username !== auth.username}
								onstatechange={(enabled) => {
									if (user) {
										user = { ...user, twofa_enabled: enabled, twofa_secret: enabled };
									}
								}}
							/>
						</div>
					</div>
				{/if}

				<!-- Groups — admin.super governance field. The API only serves it to
				     super admins (blueprint `security@: admin.super`), so guard on
				     canManagePermissions and the field's presence. -->
				{#if canManagePermissions && groupsField}
					<div class="rounded-xl border border-border bg-card p-5">
						<BlueprintForm
							fields={[groupsField]}
							data={configData}
							onchange={handleBlueprintChange}
							oncommit={autoSave.oncommit}
							errors={validationErrors}
						/>
					</div>
				{/if}

				<!-- Permissions — hidden for non-managers since the API rejects
				     writes to `access` without api.users.write, and the
				     read-only display alone would be misleading. -->
				{#if canManagePermissions}
					<div class="rounded-xl border border-border bg-card p-5">
						<h2 class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.USERS.PERMISSIONS')}</h2>
						<div class="mt-4">
							<PermissionsField value={access} inherited={inheritedAccess} onchange={handleAccessChange} />
						</div>
					</div>
				{/if}

				<!-- API Keys -->
				<ApiKeysField username={user.username} />
			</div>
		</div>
	{/if}
</div>

<ConfirmModal
	open={confirmDeleteOpen}
	title={i18n.t('ADMIN_NEXT.USERS.DELETE_USER')}
	message={`Are you sure you want to delete "${user?.fullname || username}"? This action cannot be undone.`}
	confirmLabel="Delete"
	variant="destructive"
	onconfirm={confirmDelete}
	oncancel={() => { confirmDeleteOpen = false; }}
/>

<ConfirmPasswordModal
	open={emailConfirmOpen}
	username={username}
	title={i18n.t('ADMIN_NEXT.USERS.EMAIL_CONFIRM.TITLE')}
	message={i18n.t('ADMIN_NEXT.USERS.EMAIL_CONFIRM.MESSAGE', { email: typedEmail.trim() })}
	onconfirm={confirmEmailChange}
	oncancel={cancelEmailConfirm}
/>

<UnsavedChangesModal {guard} />
