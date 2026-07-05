<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { canWrite } from '$lib/utils/permissions';
	import { auth } from '$lib/stores/auth.svelte';
	import ExtensionIcon from '$lib/components/ui/ExtensionIcon.svelte';
	import type { IconSpec } from '$lib/utils/icon-spec';

	// "Configuration" writes to user/config/flex/accounts.yaml and requires
	// admin.super on the API side. Hide the tab for non-super-admins instead
	// of letting them click through to a 403.
	const isSuper = $derived(auth.isSuperAdmin);
	const canManage = $derived(canWrite('users') || isSuper);

	type TabId = 'users' | 'groups' | 'invitations' | 'config';

	const tabs: { id: TabId; label: string; path: string; gated?: boolean; icon?: IconSpec }[] = $derived([
		{ id: 'users',  label: i18n.t('ADMIN_NEXT.USERS_NAV.USERS'),  path: `${base}/users` },
		{ id: 'groups', label: i18n.t('ADMIN_NEXT.USERS_NAV.GROUPS'), path: `${base}/users/groups`, gated: !canManage },
		{ id: 'invitations', label: i18n.t('ADMIN_NEXT.USERS_NAV.INVITATIONS'), path: `${base}/users/invitations`, gated: !canManage },
		{ id: 'config', label: i18n.t('ADMIN_NEXT.USERS_NAV.CONFIGURATION'), path: `${base}/users/config`, gated: !isSuper },
	]);

	const active = $derived.by<TabId>(() => {
		const p = page.url.pathname.replace(base, '');
		if (p.startsWith('/users/groups')) return 'groups';
		// Both the pending list (/users/invitations) and the create form
		// (/users/invite) belong to the Invitations tab. Match the shared
		// '/users/invit' prefix so both routes highlight the tab — '/users/invite'
		// alone misses '/users/invitations' (they diverge at "invit-e" vs "invit-a").
		if (p.startsWith('/users/invit')) return 'invitations';
		if (p.startsWith('/users/config')) return 'config';
		return 'users';
	});

	const visible = $derived(tabs.filter((t) => !t.gated));

	function go(path: string) {
		goto(path);
	}
</script>

<nav class="flex border-b border-border" aria-label="Users navigation">
	{#each visible as tab (tab.id)}
		<button
			type="button"
			class="relative inline-flex items-center px-4 py-2.5 text-sm font-medium transition-colors
				{active === tab.id
					? 'text-primary'
					: 'text-muted-foreground hover:text-foreground'}"
			onclick={() => go(tab.path)}
		>
			{#if tab.icon}
				<ExtensionIcon icon={tab.icon} class="me-1.5 h-4 w-4 shrink-0 text-sm" />
			{/if}
			{tab.label}
			{#if active === tab.id}
				<span class="absolute inset-x-0 -bottom-px h-0.5 bg-primary"></span>
			{/if}
		</button>
	{/each}
</nav>
