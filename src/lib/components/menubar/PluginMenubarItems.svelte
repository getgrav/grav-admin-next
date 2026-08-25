<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { faIconClass } from '$lib/utils/fa-icon';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { executeMenubarAction, type MenubarItem, type MenubarPlacement } from '$lib/api/endpoints/menubar';
	import { menubar } from '$lib/stores/menubar.svelte';
	import { modals } from '$lib/stores/modals.svelte';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import { toast } from 'svelte-sonner';
	import { Loader2 } from 'lucide-svelte';

	// Which toolbar zone this instance renders. The shared menubar store is
	// fetched once and split per zone (admin2#81); AppShell renders one
	// instance for `start` and one for `end`.
	let { placement = 'start' }: { placement?: MenubarPlacement } = $props();

	// Variant → token-based classes. Every color references an admin-next theme
	// token (never a raw hex), so plugin buttons stay theme-agnostic and
	// dark-mode safe (admin2#67). `default` keeps the original muted icon look.
	const VARIANT_CLASSES: Record<string, string> = {
		default: 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
		primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
		success: 'bg-success text-success-foreground hover:bg-success/90',
		warning: 'bg-warning text-warning-foreground hover:bg-warning/90',
		danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
	};

	function itemClasses(item: MenubarItem): string {
		const variant = VARIANT_CLASSES[item.variant ?? 'default'] ?? VARIANT_CLASSES.default;
		const md = item.size === 'md';
		// Labelled buttons need horizontal padding; icon-only buttons stay square.
		const geometry = item.showLabel
			? (md ? 'h-8 gap-2 px-3 text-sm' : 'h-7 gap-1.5 px-2.5 text-xs')
			: (md ? 'h-8 w-8' : 'h-7 w-7');
		return `inline-flex shrink-0 items-center justify-center rounded-md font-medium transition-colors disabled:opacity-50 ${geometry} ${variant}`;
	}

	const items = $derived(menubar.forPlacement(placement));
	let executing = $state<string | null>(null);
	let confirmOpen = $state(false);
	let pendingItem = $state<MenubarItem | null>(null);

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
	{#if item.href}
		<!-- Plain link (e.g. quick-tray-links): a real anchor so middle-click and
		     new-tab work, and external URLs aren't routed through the SPA. -->
		<a
			class={itemClasses(item)}
			href={item.href}
			target={item.target || undefined}
			rel={item.target === '_blank' ? 'noopener' : undefined}
			title={item.label}
		>
			{#if item.icon}
				<i class="{faIconClass(item.icon)} text-sm"></i>
			{:else}
				<i class="fa-solid fa-circle-dot text-sm"></i>
			{/if}
			{#if item.showLabel}
				<span>{item.label}</span>
			{/if}
		</a>
	{:else}
		<button
			class={itemClasses(item)}
			title={item.label}
			onclick={() => handleAction(item)}
			disabled={executing === item.id}
		>
			{#if executing === item.id}
				<Loader2 size={14} class="animate-spin" />
			{:else if item.icon}
				<i class="{faIconClass(item.icon)} text-sm"></i>
			{:else}
				<i class="fa-solid fa-circle-dot text-sm"></i>
			{/if}
			{#if item.showLabel}
				<span>{item.label}</span>
			{/if}
		</button>
	{/if}
{/each}
