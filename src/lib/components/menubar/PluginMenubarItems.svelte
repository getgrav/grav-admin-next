<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { getMenubarItems, executeMenubarAction, type MenubarItem } from '$lib/api/endpoints/menubar';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import { toast } from 'svelte-sonner';
	import { Loader2 } from 'lucide-svelte';

	let items = $state<MenubarItem[]>([]);
	let executing = $state<string | null>(null);
	let confirmOpen = $state(false);
	let pendingItem = $state<MenubarItem | null>(null);

	async function loadItems() {
		try {
			items = await getMenubarItems();
		} catch {
			// Silently fail — menubar is non-critical
		}
	}

	async function handleAction(item: MenubarItem) {
		if (item.confirm) {
			pendingItem = item;
			confirmOpen = true;
			return;
		}
		await doAction(item);
	}

	async function doAction(item: MenubarItem) {
		executing = item.id;
		try {
			const result = await executeMenubarAction(item.plugin, item.action);
			if (result.status === 'success') {
				toast.success(result.message);
			} else {
				toast.error(result.message);
			}
		} catch (err: unknown) {
			const detail = err instanceof Error ? err.message : 'Action failed';
			toast.error(detail);
		} finally {
			executing = null;
		}
	}

	$effect(() => {
		loadItems();
	});
</script>

<ConfirmModal
	open={confirmOpen}
	title={i18n.t('ADMIN_NEXT.CONFIRM_ACTION')}
	message={pendingItem?.confirm ?? ''}
	confirmLabel="Continue"
	onconfirm={() => { confirmOpen = false; if (pendingItem) doAction(pendingItem); pendingItem = null; }}
	oncancel={() => { confirmOpen = false; pendingItem = null; }}
/>

{#each items as item (item.id)}
	<button
		class="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
		title={item.label}
		onclick={() => handleAction(item)}
		disabled={executing === item.id}
	>
		{#if executing === item.id}
			<Loader2 size={14} class="animate-spin" />
		{:else if item.icon}
			<i class="fa-solid {item.icon.startsWith('fa-') ? item.icon : 'fa-' + item.icon} text-sm"></i>
		{:else}
			<i class="fa-solid fa-circle-dot text-sm"></i>
		{/if}
	</button>
{/each}
