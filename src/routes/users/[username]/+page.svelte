<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { getUser, updateUser, deleteUser, type UserInfo } from '$lib/api/endpoints/users';
	import { getUserBlueprint } from '$lib/api/endpoints/blueprints';
	import type { BlueprintSchema } from '$lib/api/endpoints/blueprints';
	import BlueprintForm from '$lib/components/blueprint/BlueprintForm.svelte';
	import PermissionsField from '$lib/components/PermissionsField.svelte';
	import TwoFactorField from '$lib/components/TwoFactorField.svelte';
	import ApiKeysField from '$lib/components/ApiKeysField.svelte';
	import UserAvatarCard from '$lib/components/UserAvatarCard.svelte';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import { auth } from '$lib/stores/auth.svelte';
	import { prefs } from '$lib/stores/preferences.svelte';
	import { createAutoSaveManager } from '$lib/utils/auto-save.svelte';
	import { createUnsavedGuard } from '$lib/utils/unsaved-guard.svelte';
	import { invalidations } from '$lib/stores/invalidation.svelte';
	import { onMount } from 'svelte';
	import {
		Save, ArrowLeft, Loader2, AlertCircle, Trash2, User, Undo2
	} from 'lucide-svelte';

	const REDACTED = '********';

	// Fields handled outside the blueprint form or not renderable in admin-next
	const SUPPRESSED_TYPES = new Set(['permissions', 'userinfo', '2fa_secret', 'api_keys']);

	const username = $derived(page.params.username ?? '');

	let user = $state<UserInfo | null>(null);
	let blueprint = $state<BlueprintSchema | null>(null);
	let etag = $state('');
	let loading = $state(true);
	let saving = $state(false);
	let deleting = $state(false);
	let error = $state('');
	let confirmDeleteOpen = $state(false);

	// Form data from blueprint fields
	let configData = $state<Record<string, unknown>>({});
	let originalJson = $state('{}');

	// Permissions handled separately
	let access = $state<Record<string, unknown>>({});
	let originalAccessJson = $state('{}');

	const hasChanges = $derived(
		JSON.stringify(configData) !== originalJson ||
		JSON.stringify(access) !== originalAccessJson
	);

	// Names of fields/sections handled manually outside the blueprint form
	const SUPPRESSED_NAMES = new Set(['security', 'twofa_check', 'avatar', 'multiavatar_only', 'api_check', 'api_section']);

	// Recursively filter out suppressed field types and named sections from blueprint
	function filterFields(fields: BlueprintSchema['fields']): BlueprintSchema['fields'] {
		return fields
			.filter((f) => {
				if (SUPPRESSED_TYPES.has(f.type)) return false;
				if (SUPPRESSED_NAMES.has(f.name)) return false;
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

	function populateForm(u: UserInfo) {
		// Build config data from user properties for blueprint fields
		configData = {
			username: u.username,
			email: u.email ?? '',
			fullname: u.fullname ?? '',
			title: u.title ?? '',
			state: u.state,
			language: (u as Record<string, unknown>).language ?? '',
			content_editor: (u as Record<string, unknown>).content_editor ?? '',
			twofa_enabled: u.twofa_enabled,
		};
		originalJson = JSON.stringify(configData);

		access = structuredClone(u.access);
		originalAccessJson = JSON.stringify(access);
	}

	async function loadUser() {
		loading = true;
		error = '';
		try {
			const [userResult, blueprintResult] = await Promise.all([
				getUser(username),
				getUserBlueprint().catch(() => null),
			]);

			user = userResult.user;
			etag = userResult.etag;
			blueprint = blueprintResult;
			populateForm(userResult.user);
		} catch {
			error = `Failed to load user '${username}'.`;
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

	async function handleSave() {
		saving = true;
		try {
			const cleaned = stripRedacted(configData) as Record<string, unknown>;
			// Merge blueprint data with access permissions
			const body: Record<string, unknown> = {
				...cleaned,
				access,
			};
			// Don't send username (readonly) or empty password
			delete body.username;
			if (!body.password || body.password === '') {
				delete body.password;
			}

			const result = await updateUser(username, body, etag);
			user = result.user;
			etag = result.etag;
			populateForm(result.user);

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

			toast.success(`User '${username}' saved`);
		} catch (err: unknown) {
			if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 409) {
				toast.error('User was modified elsewhere. Please reload.');
			} else {
				toast.error('Failed to save user.');
			}
		} finally {
			saving = false;
		}
	}

	function handleDelete() {
		if (!user) return;
		if (user.username === auth.username) {
			toast.error("You cannot delete your own account.");
			return;
		}
		confirmDeleteOpen = true;
	}

	async function confirmDelete() {
		confirmDeleteOpen = false;
		deleting = true;
		try {
			await deleteUser(username);
			toast.success(`User '${username}' deleted`);
			goto(`${base}/users`);
		} catch {
			toast.error(`Failed to delete user '${username}'`);
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
			prefs.autoSaveEnabled ? autoSave.forceSave() : (hasChanges && !saving && handleSave());
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
		save: handleSave,
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
		formName: 'User',
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
			else toast.info('User changed elsewhere — save to overwrite or reload');
		});
		return () => { unsub(); };
	});
</script>

<svelte:head>
	<title>{user?.fullname ?? username} — Users — Grav Admin</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="flex h-full flex-col">
	<!-- Header -->
	<div class="flex min-h-14 items-center justify-between border-b border-border px-6 pt-6 pb-3">
		<div class="flex items-center gap-3">
			<button
				type="button"
				class="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				onclick={() => goto(`${base}/users`)}
			>
				<ArrowLeft size={16} />
			</button>
			{#if user}
				<div class="flex items-center gap-3">
					<div class="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
						<User size={16} />
					</div>
					<div>
						<h1 class="text-lg font-semibold text-foreground">{user.fullname || user.username}</h1>
						<p class="text-xs text-muted-foreground">@{user.username}</p>
					</div>
				</div>
			{/if}
		</div>

		<div class="flex items-center gap-2">
			{#if prefs.autoSaveEnabled && prefs.autoSaveToolbarUndo && autoSave.canUndo}
				<Button variant="outline" size="sm" onclick={() => autoSave.undo()}>
					<Undo2 size={14} />
					Undo
				</Button>
			{/if}
			{#if user}
				<Button
					variant="destructive"
					size="sm"
					onclick={handleDelete}
					disabled={deleting || user.username === auth.username}
				>
					{#if deleting}
						<Loader2 size={14} class="mr-1.5 animate-spin" />
					{:else}
						<Trash2 size={14} class="mr-1.5" />
					{/if}
					Delete
				</Button>

				<Button
					size="sm"
					onclick={handleSave}
					disabled={!hasChanges || saving}
				>
					{#if saving}
						<Loader2 size={14} class="mr-1.5 animate-spin" />
					{:else}
						<Save size={14} class="mr-1.5" />
					{/if}
					Save
				</Button>
			{/if}
		</div>
	</div>

	<!-- Content -->
	{#if loading}
		<div class="flex flex-1 items-center justify-center">
			<Loader2 size={24} class="animate-spin text-muted-foreground" />
		</div>
	{:else if error}
		<div class="flex flex-1 items-center justify-center">
			<div class="text-center">
				<AlertCircle size={32} class="mx-auto text-destructive" />
				<p class="mt-2 text-sm text-destructive">{error}</p>
				<Button variant="outline" size="sm" class="mt-3" onclick={() => goto(`${base}/users`)}>
					Back to Users
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
					/>
				{/if}

				<!-- 2FA Section -->
				<div class="rounded-xl border border-border bg-card p-5">
					<h2 class="text-sm font-semibold text-foreground">2-Factor Authentication</h2>
					<div class="mt-4 space-y-4">
						<!-- 2FA toggle -->
						<div class="flex items-center justify-between">
							<div>
								<div class="text-sm font-medium text-foreground">2FA Enabled</div>
								<div class="text-xs text-muted-foreground">Require a one-time code on login</div>
							</div>
							<button
								type="button"
								class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
									{configData.twofa_enabled ? 'bg-primary' : 'bg-muted'}"
								role="switch"
								aria-checked={!!configData.twofa_enabled}
								onclick={() => handleBlueprintChange('twofa_enabled', !configData.twofa_enabled)}
							>
								<span
									class="pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform
										{configData.twofa_enabled ? 'translate-x-5' : 'translate-x-0'}"
								></span>
							</button>
						</div>

						<!-- 2FA secret / QR code -->
						{#if user}
							<TwoFactorField
								username={user.username}
								twofaEnabled={!!configData.twofa_enabled}
								hasSecret={user.twofa_secret}
							/>
						{/if}
					</div>
				</div>

				<!-- Permissions (always rendered separately) -->
				<div class="rounded-xl border border-border bg-card p-5">
					<h2 class="text-sm font-semibold text-foreground">Permissions</h2>
					<div class="mt-4">
						<PermissionsField value={access} onchange={handleAccessChange} />
					</div>
				</div>

				<!-- API Keys -->
				<ApiKeysField username={user.username} />
			</div>
		</div>
	{/if}
</div>

<ConfirmModal
	open={confirmDeleteOpen}
	title="Delete User"
	message={`Are you sure you want to delete "${user?.fullname || username}"? This action cannot be undone.`}
	confirmLabel="Delete"
	variant="destructive"
	onconfirm={confirmDelete}
	oncancel={() => { confirmDeleteOpen = false; }}
/>

<ConfirmModal
	open={guard.showModal}
	title="Unsaved Changes"
	message="You have unsaved changes. Leave anyway?"
	confirmLabel="Leave"
	cancelLabel="Stay"
	onconfirm={guard.confirm}
	oncancel={guard.cancel}
/>
