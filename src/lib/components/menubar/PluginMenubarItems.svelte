<script lang="ts">
	import { getMenubarItems, executeMenubarAction, type MenubarItem } from '$lib/api/endpoints/menubar';
	import { toast } from 'svelte-sonner';
	import { Loader2 } from 'lucide-svelte';

	let items = $state<MenubarItem[]>([]);
	let executing = $state<string | null>(null);

	async function loadItems() {
		try {
			items = await getMenubarItems();
		} catch {
			// Silently fail — menubar is non-critical
		}
	}

	async function handleAction(item: MenubarItem) {
		if (item.confirm && !confirm(item.confirm)) return;

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
