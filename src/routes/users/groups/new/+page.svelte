<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { createGroup } from '$lib/api/endpoints/groups';
	import { Button } from '$lib/components/ui/button';
	import StickyHeader from '$lib/components/ui/StickyHeader.svelte';
	import { canWrite } from '$lib/utils/permissions';
	import { toast } from 'svelte-sonner';
	import { Loader2, Save, Users } from 'lucide-svelte';
	import DirectionalIcon from '$lib/components/ui/DirectionalIcon.svelte';

	let groupname = $state('');
	let readableName = $state('');
	let description = $state('');
	let saving = $state(false);

	const canSave = $derived(canWrite('users') && /^[a-zA-Z0-9_-]{1,200}$/.test(groupname));

	async function handleCreate() {
		if (!canSave) return;
		saving = true;
		try {
			await createGroup({ groupname, readableName, description });
			toast.success(i18n.t('ADMIN_NEXT.GROUPS.GROUP_CREATED', { name: groupname }));
			goto(`${base}/users/groups/${groupname}`);
		} catch (err: unknown) {
			const message = err && typeof err === 'object' && 'message' in err
				? (err as { message: string }).message
				: i18n.t('ADMIN_NEXT.GROUPS.FAILED_TO_CREATE_GROUP');
			toast.error(message);
		} finally {
			saving = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 's') {
			e.preventDefault();
			if (canSave && !saving) handleCreate();
		}
	}
</script>

<svelte:head>
	<title>{i18n.t('ADMIN_NEXT.GROUPS.NEW_GROUP_GRAV_ADMIN')}</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="flex h-full flex-col">
	<StickyHeader>
		{#snippet children({ scrolled })}
			<div class="flex items-center justify-between px-6 transition-[padding] duration-200 {scrolled ? 'py-2' : 'pt-6 pb-3'}">
				<div class="flex items-center gap-2">
					<Users size={scrolled ? 16 : 20} class="text-muted-foreground" />
					<h1 class="font-semibold tracking-tight text-foreground transition-[font-size] duration-200 {scrolled ? 'text-sm' : 'text-xl'}">
						{i18n.t('ADMIN_NEXT.GROUPS.NEW_GROUP')}
					</h1>
				</div>
				<div class="flex items-center gap-2">
					<Button variant="outline" size="sm" onclick={() => goto(`${base}/users/groups`)}>
						<DirectionalIcon name="chevron-back" size={14} />
						{i18n.t('ADMIN_NEXT.GROUPS.BACK_TO_GROUPS')}
					</Button>
					<Button size="sm" disabled={!canSave || saving} onclick={handleCreate}>
						{#if saving}
							<Loader2 size={14} class="animate-spin" />
						{:else}
							<Save size={14} />
						{/if}
						{i18n.t('ADMIN_NEXT.GROUPS.CREATE')}
					</Button>
				</div>
			</div>
		{/snippet}
	</StickyHeader>

	<div class="flex-1 overflow-y-auto">
		<div class="mx-auto max-w-2xl px-6 py-6 space-y-4">
			<div>
				<label for="groupname-input" class="mb-1 block text-sm font-medium text-foreground">
					{i18n.t('ADMIN_NEXT.GROUPS.GROUP_NAME')}
				</label>
				<input
					id="groupname-input"
					type="text"
					class="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
					placeholder={i18n.t('ADMIN_NEXT.GROUPS.GROUP_NAME_PLACEHOLDER')}
					bind:value={groupname}
				/>
				<p class="mt-1 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.GROUPS.GROUP_NAME_HELP')}</p>
			</div>
			<div>
				<label for="readableName-input" class="mb-1 block text-sm font-medium text-foreground">
					{i18n.t('ADMIN_NEXT.GROUPS.DISPLAY_NAME')}
				</label>
				<input
					id="readableName-input"
					type="text"
					class="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
					bind:value={readableName}
				/>
			</div>
			<div>
				<label for="description-input" class="mb-1 block text-sm font-medium text-foreground">
					{i18n.t('ADMIN_NEXT.GROUPS.DESCRIPTION')}
				</label>
				<input
					id="description-input"
					type="text"
					class="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
					bind:value={description}
				/>
			</div>
		</div>
	</div>
</div>
