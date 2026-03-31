<script lang="ts">
	import { page } from '$app/state';
	import { goto, beforeNavigate } from '$app/navigation';
	import { getUser, updateUser, deleteUser, type UserInfo } from '$lib/api/endpoints/users';
	import PermissionsField from '$lib/components/PermissionsField.svelte';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import { auth } from '$lib/stores/auth.svelte';
	import {
		Save, ArrowLeft, Loader2, AlertCircle, Trash2, User
	} from 'lucide-svelte';

	const username = $derived(page.params.username ?? '');

	let user = $state<UserInfo | null>(null);
	let etag = $state('');
	let loading = $state(true);
	let saving = $state(false);
	let deleting = $state(false);
	let error = $state('');
	let confirmDeleteOpen = $state(false);

	// Editable fields
	let email = $state('');
	let fullname = $state('');
	let title = $state('');
	let accountState = $state<'enabled' | 'disabled'>('enabled');
	let password = $state('');
	let access = $state<Record<string, unknown>>({});

	// Track original for change detection
	let originalJson = $state('');

	const currentData = $derived(JSON.stringify({ email, fullname, title, accountState, access }));
	const hasChanges = $derived(currentData !== originalJson || password !== '');

	function populateForm(u: UserInfo) {
		email = u.email ?? '';
		fullname = u.fullname ?? '';
		title = u.title ?? '';
		accountState = u.state;
		access = structuredClone(u.access);
		password = '';
		originalJson = JSON.stringify({ email, fullname, title, accountState, access });
	}

	async function loadUser() {
		loading = true;
		error = '';
		try {
			const result = await getUser(username);
			user = result.user;
			etag = result.etag;
			populateForm(result.user);
		} catch {
			error = `Failed to load user '${username}'.`;
		} finally {
			loading = false;
		}
	}

	async function handleSave() {
		saving = true;
		try {
			const body: Record<string, unknown> = {
				email,
				fullname,
				title,
				state: accountState,
				access,
			};
			if (password) {
				body.password = password;
			}

			const result = await updateUser(username, body, etag);
			user = result.user;
			etag = result.etag;
			populateForm(result.user);
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
			goto('/users');
		} catch {
			toast.error(`Failed to delete user '${username}'`);
		} finally {
			deleting = false;
		}
	}

	function handleAccessChange(newAccess: Record<string, unknown>) {
		access = newAccess;
	}

	function handleKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 's') {
			e.preventDefault();
			if (hasChanges && !saving) handleSave();
		}
	}

	beforeNavigate(({ cancel }) => {
		if (hasChanges && !confirm('You have unsaved changes. Leave anyway?')) {
			cancel();
		}
	});

	$effect(() => {
		username; // track
		loadUser();
	});
</script>

<svelte:head>
	<title>{user?.fullname ?? username} — Users — Grav Admin</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="flex h-full flex-col">
	<!-- Header -->
	<div class="flex items-center justify-between border-b border-border px-6 py-3">
		<div class="flex items-center gap-3">
			<button
				type="button"
				class="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				onclick={() => goto('/users')}
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
				<Button variant="outline" size="sm" class="mt-3" onclick={() => goto('/users')}>
					Back to Users
				</Button>
			</div>
		</div>
	{:else if user}
		<div class="flex-1 overflow-y-auto">
			<div class="mx-auto max-w-3xl space-y-6 px-6 py-6">
				<!-- Account details -->
				<div class="rounded-xl border border-border bg-card p-5">
					<h2 class="text-sm font-semibold text-foreground">Account</h2>
					<div class="mt-4 space-y-4">
						<div>
							<label for="username" class="block text-xs font-medium text-muted-foreground">Username</label>
							<input
								id="username"
								type="text"
								value={user.username}
								disabled
								class="mt-1 h-9 w-full rounded-md border border-input bg-muted/50 px-3 text-sm text-muted-foreground"
							/>
						</div>
						<div class="grid gap-4 sm:grid-cols-2">
							<div>
								<label for="fullname" class="block text-xs font-medium text-muted-foreground">Full Name</label>
								<input
									id="fullname"
									type="text"
									bind:value={fullname}
									class="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
								/>
							</div>
							<div>
								<label for="title-field" class="block text-xs font-medium text-muted-foreground">Title</label>
								<input
									id="title-field"
									type="text"
									bind:value={title}
									class="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
								/>
							</div>
						</div>
						<div>
							<label for="email" class="block text-xs font-medium text-muted-foreground">Email</label>
							<input
								id="email"
								type="email"
								bind:value={email}
								class="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
							/>
						</div>
						<div>
							<label for="password" class="block text-xs font-medium text-muted-foreground">New Password</label>
							<input
								id="password"
								type="password"
								autocomplete="new-password"
								bind:value={password}
								placeholder="Leave blank to keep current"
								class="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
							/>
						</div>
						<div>
							<label for="state" class="block text-xs font-medium text-muted-foreground">Status</label>
							<select
								id="state"
								bind:value={accountState}
								class="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
							>
								<option value="enabled">Enabled</option>
								<option value="disabled">Disabled</option>
							</select>
						</div>
					</div>
				</div>

				<!-- Permissions -->
				<div class="rounded-xl border border-border bg-card p-5">
					<h2 class="text-sm font-semibold text-foreground">Permissions</h2>
					<div class="mt-4">
						<PermissionsField value={access} onchange={handleAccessChange} />
					</div>
				</div>
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
