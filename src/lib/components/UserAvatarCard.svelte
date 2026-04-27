<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { uploadAvatar, deleteAvatar, type UserInfo } from '$lib/api/endpoints/users';
	import { resolveAvatarUrl } from '$lib/utils/avatar';
	import { auth } from '$lib/stores/auth.svelte';
	import { toast } from 'svelte-sonner';
	import { Upload, Trash2, Loader2 } from 'lucide-svelte';

	interface Props {
		user: UserInfo;
		onupdated: (user: UserInfo) => void;
	}

	let { user, onupdated }: Props = $props();

	let uploading = $state(false);
	let removing = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);

	function syncAuthAvatar(updated: UserInfo) {
		if (updated.username === auth.username) {
			auth.setUser(updated.username, updated.fullname || updated.username, updated.email || '', updated.avatar_url || '');
		}
	}

	const avatarSrc = $derived(
		resolveAvatarUrl(user.avatar_url, user.email, user.fullname, user.username)
	);

	async function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		uploading = true;
		try {
			const updated = await uploadAvatar(user.username, file);
			onupdated(updated);
			syncAuthAvatar(updated);
			toast.success(i18n.t('ADMIN_NEXT.USER_AVATAR_CARD.AVATAR_UPDATED'));
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.USER_AVATAR_CARD.FAILED_TO_UPLOAD_AVATAR'));
		} finally {
			uploading = false;
			if (input) input.value = '';
		}
	}

	async function handleRemove() {
		removing = true;
		try {
			const updated = await deleteAvatar(user.username);
			onupdated(updated);
			syncAuthAvatar(updated);
			toast.success(i18n.t('ADMIN_NEXT.USER_AVATAR_CARD.AVATAR_REMOVED'));
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.USER_AVATAR_CARD.FAILED_TO_REMOVE_AVATAR'));
		} finally {
			removing = false;
		}
	}
</script>

<div class="rounded-xl border border-border bg-card p-6">
	<div class="flex items-center gap-6">
		<!-- Avatar -->
		<div class="relative shrink-0">
			<img
				src={avatarSrc}
				alt={user.fullname ?? user.username}
				class="h-24 w-24 rounded-full object-cover ring-4 ring-background shadow-lg"
			/>
			{#if uploading}
				<div class="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
					<Loader2 size={20} class="animate-spin text-white" />
				</div>
			{/if}
		</div>

		<!-- User info -->
		<div class="min-w-0 flex-1">
			<h2 class="text-xl font-semibold text-foreground">{user.fullname || user.username}</h2>
			<div class="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
				{#if user.email}
					<span class="text-primary">{user.email}</span>
				{/if}
				{#if user.title}
					<span>— {user.title}</span>
				{/if}
			</div>
			<div class="mt-3 flex items-center gap-2">
				<input
					bind:this={fileInput}
					type="file"
					accept="image/*"
					class="hidden"
					onchange={handleFileSelect}
				/>
				<button
					type="button"
					class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					onclick={() => fileInput?.click()}
					disabled={uploading}
				>
					<Upload size={12} />
					{i18n.t('ADMIN_NEXT.USER_AVATAR_CARD.UPLOAD_AVATAR')}
				</button>
				{#if user.avatar_url}
					<button
						type="button"
						class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
						onclick={handleRemove}
						disabled={removing}
					>
						{#if removing}
							<Loader2 size={12} class="animate-spin" />
						{:else}
							<Trash2 size={12} />
						{/if}
						{i18n.t('ADMIN_NEXT.REMOVE')}
					</button>
				{/if}
			</div>
		</div>
	</div>
</div>
