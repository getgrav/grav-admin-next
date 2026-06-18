<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { getMenubarItems, executeMenubarAction, type MenubarItem } from '$lib/api/endpoints/menubar';
	import { invalidations } from '$lib/stores/invalidation.svelte';
	import { modals } from '$lib/stores/modals.svelte';
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

	// Reload when a plugin is installed/removed/enabled/disabled. A single
	// API response can emit multiple tags (e.g. `plugins:create:foo,
	// plugins:list, gpm:update`); coalesce them into one reload per burst.
	let reloadScheduled = false;
	function scheduleReload() {
		if (reloadScheduled) return;
		reloadScheduled = true;
		queueMicrotask(() => {
			reloadScheduled = false;
			loadItems();
		});
	}

	async function handleAction(item: MenubarItem) {
		if (item.confirm) {
			pendingItem = item;
			confirmOpen = true;
			return;
		}
		await runItem(item);
	}

	// Client-side intents (route navigation, modal) take precedence over the
	// server action. This is what lets a plugin offer e.g. a "New Article"
	// button that deep-links to /pages/new with a preset parent + template, or
	// opens its own modal — without a server round-trip.
	async function runItem(item: MenubarItem) {
		if (item.route) {
			goto(`${base}${item.route}`);
			return;
		}
		if (item.modal) {
			await modals.open({
				kind: 'component',
				plugin: item.plugin,
				component: item.modal.component,
				title: item.modal.title ?? item.label,
				props: item.modal.props,
				size: item.modal.size,
				useStandardHeader: item.modal.useStandardHeader,
			});
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

	$effect(() => {
		const unsubs = [
			invalidations.subscribe('plugins:*', scheduleReload),
			invalidations.subscribe('themes:*', scheduleReload),
			invalidations.subscribe('gpm:*', scheduleReload),
		];
		return () => { for (const u of unsubs) u(); };
	});
</script>

<ConfirmModal
	open={confirmOpen}
	title={i18n.t('ADMIN_NEXT.CONFIRM_ACTION')}
	message={pendingItem?.confirm ?? ''}
	confirmLabel="Continue"
	onconfirm={() => { confirmOpen = false; if (pendingItem) runItem(pendingItem); pendingItem = null; }}
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
