import { goto } from '$app/navigation';
import { base } from '$app/paths';
import { toast } from 'svelte-sonner';
import { executeMenubarAction, getMenubarItems, type MenubarItem, type MenubarPlacement } from '$lib/api/endpoints/menubar';
import { invalidations } from './invalidation.svelte';
import { takeBootPart } from './boot';
import { dialogs } from './dialogs.svelte';
import { modals } from './modals.svelte';
import { i18n } from './i18n.svelte';

/**
 * Shared menubar-items store. The toolbar renders plugin buttons in two zones
 * (a `start` zone in the open space on the left, and an `end` zone beside the
 * core actions — see admin2#81), so the items are fetched once here and split
 * per zone, rather than each zone component fetching its own copy.
 */
function createMenubarStore() {
	let items = $state<MenubarItem[]>([]);
	let loaded = $state(false);
	// The id of the item whose server action is running. Shared so the toolbar
	// button and its row in the phone overflow menu both show the spinner.
	let executing = $state<string | null>(null);

	/** `fromBoot` takes the items from the boot request when it has them. */
	async function load(fromBoot = false) {
		try {
			const boot = fromBoot ? await takeBootPart<MenubarItem[]>('menubar') : null;
			items = boot ? boot.value : await getMenubarItems();
			loaded = true;
		} catch {
			// Silently fail — the menubar is non-critical.
		}
	}

	// Reload when a plugin/theme is installed/removed/enabled/disabled. A single
	// API response can emit multiple tags (e.g. `plugins:create:foo,
	// plugins:list, gpm:update`); coalesce them into one reload per burst.
	let reloadScheduled = false;
	function scheduleReload() {
		if (reloadScheduled) return;
		reloadScheduled = true;
		queueMicrotask(() => {
			reloadScheduled = false;
			load();
		});
	}

	if (typeof window !== 'undefined') {
		invalidations.subscribe('plugins:*', scheduleReload);
		invalidations.subscribe('themes:*', scheduleReload);
		invalidations.subscribe('gpm:*', scheduleReload);
	}

	// Items for one zone, ordered by `priority` (higher first; ties keep plugin
	// registration order via the stable sort). Items without a `placement`
	// default to `start` so existing plugin buttons land in the open left space
	// rather than crowding the destructive Clear Cache action.
	function forPlacement(placement: MenubarPlacement): MenubarItem[] {
		return items
			.filter((item) => (item.placement ?? 'start') === placement)
			.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
	}

	// Clicking an item, from the toolbar or from the phone overflow menu. A
	// `confirm` prompt comes first. Client-side intents (route navigation,
	// modal) take precedence over the server action: that is what lets a plugin
	// offer e.g. a "New Article" button that deep-links to /pages/new with a
	// preset parent + template, or opens its own modal, without a round-trip.
	async function run(item: MenubarItem) {
		if (item.confirm) {
			const ok = await dialogs.confirm({
				title: i18n.t('ADMIN_NEXT.CONFIRM_ACTION'),
				message: item.confirm,
				confirmLabel: 'Continue',
			});
			if (!ok) return;
		}
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

	return {
		get items() { return items; },
		get loaded() { return loaded; },
		get executing() { return executing; },
		load,
		forPlacement,
		run,
	};
}

export const menubar = createMenubarStore();
