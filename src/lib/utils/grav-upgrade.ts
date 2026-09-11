import { toast } from 'svelte-sonner';
import {
	upgradeGrav,
	gravPreflightReport,
	type GravPreflightReport,
	type GravUpgradeResult
} from '$lib/api/endpoints/gpm';
import { dialogs } from '$lib/stores/dialogs.svelte';
import { i18n } from '$lib/stores/i18n.svelte';

/**
 * Confirm and run a Grav core upgrade. Shared by the dashboard and the update
 * banner so both treat a refused upgrade the same way.
 *
 * When the checks that run before an upgrade stop it (HTTP 409), the reasons
 * and the plugins and themes they name are listed, with the option to upgrade
 * anyway. Before this the admin only saw "Grav upgrade failed" with no reason,
 * which made getgrav/grav#4299 hard to diagnose from a report.
 *
 * `onBusy` is told when each attempt starts and ends, so the caller's busy
 * state is off while a dialog waits on the admin. Resolves the upgrade result,
 * or null when cancelled or failed (a toast has said why).
 */
export async function confirmAndUpgradeGrav(
	current: string,
	target: string,
	onBusy?: (busy: boolean) => void
): Promise<GravUpgradeResult | null> {
	const ok = await dialogs.confirm({
		title: i18n.t('ADMIN_NEXT.GRAV_UPGRADE.CONFIRM_TITLE'),
		message: i18n.t('ADMIN_NEXT.GRAV_UPGRADE.CONFIRM_MESSAGE', { current, target }),
		confirmLabel: i18n.t('ADMIN_NEXT.SYSTEM_HEALTH_WIDGET.UPGRADE_GRAV')
	});
	if (!ok) return null;

	return attempt(target, false, onBusy);
}

async function attempt(
	target: string,
	override: boolean,
	onBusy?: (busy: boolean) => void
): Promise<GravUpgradeResult | null> {
	let report: GravPreflightReport | null;
	onBusy?.(true);
	const toastId = toast.loading(i18n.t('ADMIN_NEXT.GRAV_UPGRADE.UPGRADING', { version: target }));
	try {
		const result = await upgradeGrav(override);
		toast.success(i18n.t('ADMIN_NEXT.TOASTS.GRAV_UPGRADED', { version: result.new_version }), {
			id: toastId
		});
		return result;
	} catch (err: unknown) {
		report = gravPreflightReport(err);
		if (!report) {
			const detail =
				(err instanceof Error && err.message) || i18n.t('ADMIN_NEXT.GRAV_UPGRADE.NO_DETAIL');
			toast.error(i18n.t('ADMIN_NEXT.GRAV_UPGRADE.FAILED', { detail }), { id: toastId });
			return null;
		}
		toast.dismiss(toastId);
	} finally {
		onBusy?.(false);
	}

	// Already overridden, or the server says an override can't help: say what is still in the way.
	if (override || report.can_override === false) {
		toast.error(
			i18n.t('ADMIN_NEXT.GRAV_UPGRADE.STILL_BLOCKED', { detail: report.blocking.join(' ') })
		);
		return null;
	}

	const anyway = await dialogs.confirm({
		title: i18n.t('ADMIN_NEXT.GRAV_UPGRADE.PREFLIGHT_TITLE', { version: target }),
		message: i18n.t('ADMIN_NEXT.GRAV_UPGRADE.PREFLIGHT_MESSAGE'),
		items: preflightItems(report),
		confirmLabel: i18n.t('ADMIN_NEXT.GRAV_UPGRADE.UPGRADE_ANYWAY'),
		variant: 'destructive'
	});

	return anyway ? attempt(target, true, onBusy) : null;
}

/** Core's reasons first, then one line per plugin or theme the compatibility reason names. */
function preflightItems(report: GravPreflightReport): string[] {
	const items = [...report.blocking];
	const incompatible = Array.isArray(report.incompatible_packages)
		? {}
		: (report.incompatible_packages?.blocking ?? {});
	for (const [name, pkg] of Object.entries(incompatible)) {
		items.push(
			i18n.t('ADMIN_NEXT.GRAV_UPGRADE.INCOMPATIBLE_PACKAGE', {
				name,
				version: pkg.version ?? '?',
				compatible: pkg.compatibility?.grav?.join(', ') || '?'
			})
		);
	}
	return items;
}
