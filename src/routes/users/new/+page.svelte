<script lang="ts">
	import { goto } from '$app/navigation';
	import { createUser } from '$lib/api/endpoints/users';
	import PermissionsField from '$lib/components/PermissionsField.svelte';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import { ArrowLeft, Loader2, Save, UserPlus } from 'lucide-svelte';

	let username = $state('');
	let email = $state('');
	let fullname = $state('');
	let title = $state('');
	let password = $state('');
	let accountState = $state<'enabled' | 'disabled'>('enabled');
	let access = $state<Record<string, unknown>>({});
	let saving = $state(false);

	const canSave = $derived(username.length >= 3 && email.length > 0 && password.length > 0);

	async function handleCreate() {
		saving = true;
		try {
			await createUser({
				username,
				password,
				email,
				fullname: fullname || undefined,
				title: title || undefined,
				state: accountState,
				access: Object.keys(access).length > 0 ? access : undefined,
			});
			toast.success(`User '${username}' created`);
			goto(`/users/${username}`);
		} catch (err: unknown) {
			const message = err && typeof err === 'object' && 'message' in err
				? (err as { message: string }).message
				: 'Failed to create user';
			toast.error(message);
		} finally {
			saving = false;
		}
	}

	function handleAccessChange(newAccess: Record<string, unknown>) {
		access = newAccess;
	}

	function handleKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 's') {
			e.preventDefault();
			if (canSave && !saving) handleCreate();
		}
	}
</script>

<svelte:head>
	<title>New User — Grav Admin</title>
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
			<div class="flex items-center gap-3">
				<div class="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
					<UserPlus size={16} />
				</div>
				<h1 class="text-lg font-semibold text-foreground">New User</h1>
			</div>
		</div>

		<Button
			size="sm"
			onclick={handleCreate}
			disabled={!canSave || saving}
		>
			{#if saving}
				<Loader2 size={14} class="mr-1.5 animate-spin" />
			{:else}
				<Save size={14} class="mr-1.5" />
			{/if}
			Create
		</Button>
	</div>

	<!-- Content -->
	<div class="flex-1 overflow-y-auto">
		<div class="space-y-6 px-6 py-6">
			<!-- Account details -->
			<div class="rounded-xl border border-border bg-card p-5">
				<h2 class="text-sm font-semibold text-foreground">Account</h2>
				<div class="mt-4 space-y-4">
					<div>
						<label for="username" class="block text-xs font-medium text-muted-foreground">
							Username <span class="text-destructive">*</span>
						</label>
						<input
							id="username"
							type="text"
							bind:value={username}
							placeholder="lowercase, 3-64 chars"
							class="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
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
						<label for="email" class="block text-xs font-medium text-muted-foreground">
							Email <span class="text-destructive">*</span>
						</label>
						<input
							id="email"
							type="email"
							bind:value={email}
							class="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
						/>
					</div>
					<div>
						<label for="password" class="block text-xs font-medium text-muted-foreground">
							Password <span class="text-destructive">*</span>
						</label>
						<input
							id="password"
							type="password"
							autocomplete="new-password"
							bind:value={password}
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
</div>
