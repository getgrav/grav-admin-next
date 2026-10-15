import { setContext } from 'svelte';
import { toast } from 'svelte-sonner';
import { i18n } from '$lib/stores/i18n.svelte';
import { getConfig, revertConfig } from '$lib/api/endpoints/config';
import { switchEnvironment } from '$lib/utils/switch-environment';
import {
	formatShadowValue,
	shadowForField,
	shadowedHits,
	type ShadowedEntry,
} from '$lib/utils/config-shadowed';

export const CONFIG_SHADOWED_CTX = 'configShadowed';

/** Read by FieldShadowIndicator and ConfigShadowedBanner. */
export interface ConfigShadowedCtx {
	readonly entries: ShadowedEntry[];
	/** The entry to mark on this field, if any (see shadowForField). */
	forField(path: string): { entry: ShadowedEntry; exact: boolean } | null;
	/** May the user remove an environment override (config write)? */
	readonly canRemove: boolean;
	readonly busy: boolean;
	/** Remove these keys from their environment files, then refresh. */
	remove(entries: ShadowedEntry[]): Promise<void>;
	/** Switch the admin to an environment (confirms when dirty, reloads). */
	switchTo(environment: string): void;
}

export interface ConfigShadowedController extends ConfigShadowedCtx {
	/** Record `shadowed` from a config load/save response. */
	ingest(entries: ShadowedEntry[] | undefined): void;
	/**
	 * Toast the result of a save. When a changed path is shadowed, warn (with a
	 * "Remove override" action for environment entries) instead of the plain
	 * success message.
	 */
	notifySaved(changed: string[], successMessage: string, entries?: ShadowedEntry[]): void;
}

/** A shadowed value as display text: on/off for booleans, "empty" for blanks. */
export function shadowValueText(value: unknown): string {
	return formatShadowValue(value, {
		on: i18n.t('ADMIN_NEXT.CONFIG.SHADOWED.VALUE_ON'),
		off: i18n.t('ADMIN_NEXT.CONFIG.SHADOWED.VALUE_OFF'),
		empty: i18n.t('ADMIN_NEXT.CONFIG.OVERRIDE.DEFAULT_EMPTY'),
	});
}

/**
 * Remove keys from an environment's own file for a scope (the layer above
 * base), so base decides again. Toasts the outcome; resolves true on success.
 */
export async function removeEnvironmentOverride(scope: string, entries: ShadowedEntry[]): Promise<boolean> {
	const byEnv: Record<string, string[]> = {};
	for (const e of entries) {
		if (e.source !== 'environment' || !e.environment) continue;
		(byEnv[e.environment] ??= []).push(e.path);
	}
	const environments = Object.keys(byEnv);
	if (environments.length === 0) return false;
	try {
		for (const environment of environments) {
			await revertConfig(scope, { keys: byEnv[environment] }, undefined, { environment });
		}
		const names = environments.join(', ');
		toast.success(i18n.t('ADMIN_NEXT.CONFIG.SHADOWED.REMOVED', { env: names }));
		return true;
	} catch (err: unknown) {
		const detail = err instanceof Error ? err.message : '';
		toast.error(i18n.t('ADMIN_NEXT.CONFIG.SHADOWED.REMOVE_FAILED'), detail ? { description: detail } : undefined);
		return false;
	}
}

/**
 * Warn after a plugin's enabled toggle when `enabled` is decided by a layer
 * above the one just written. Returns false (and toasts nothing) when it is
 * not, so the caller shows its usual success message.
 */
export function warnShadowedToggle(opts: {
	name: string;
	scope: string;
	shadowed: ShadowedEntry[];
	canRemove: boolean;
	onRemoved?: () => void | Promise<void>;
}): boolean {
	const entry = opts.shadowed.find((e) => e.path === 'enabled');
	if (!entry) return false;
	const state = entry.value === false ? 'off' : 'on';
	const message =
		entry.source === 'server'
			? i18n.t('ADMIN_NEXT.CONFIG.SHADOWED.TOGGLE_SERVER', { name: opts.name, state })
			: i18n.t('ADMIN_NEXT.CONFIG.SHADOWED.TOGGLE_ENV', { name: opts.name, state, env: entry.environment ?? '' });
	toast.warning(message, {
		duration: 12000,
		action:
			entry.source === 'environment' && opts.canRemove
				? {
						label: i18n.t('ADMIN_NEXT.CONFIG.SHADOWED.REMOVE_OVERRIDE'),
						onClick: async () => {
							if (await removeEnvironmentOverride(opts.scope, [entry])) await opts.onRemoved?.();
						},
					}
				: undefined,
	});
	return true;
}

/**
 * Wire the "a layer above wins" markers, banner and save warning for a config
 * form. Sets the `configShadowed` context and owns the shadowed list. The
 * opposite of provideConfigOverrides (which marks what THIS layer overrides).
 * See docs/config-overrides-revert.md.
 */
export function provideConfigShadowed(opts: {
	scope: () => string;
	canWrite: () => boolean;
	/** A field's display label for the save warning; the path when omitted. */
	labelFor?: (path: string) => string;
	/** Extra refresh after an override is removed (e.g. a plugin's enabled_source). */
	afterRemove?: () => void | Promise<void>;
}): ConfigShadowedController {
	let entries = $state<ShadowedEntry[]>([]);
	let busy = $state(false);

	async function remove(list: ShadowedEntry[]) {
		if (busy || !opts.canWrite()) return;
		busy = true;
		try {
			const scope = opts.scope();
			if (!(await removeEnvironmentOverride(scope, list))) return;
			// The removal wrote another layer, so its response describes that
			// layer. Re-read this one for a fresh list; the form's own data is
			// unchanged (its file was not touched).
			try {
				entries = (await getConfig(scope)).shadowed;
			} catch {
				const removed = list.map((e) => `${e.environment}|${e.path}`);
				entries = entries.filter((e) => !removed.includes(`${e.environment}|${e.path}`));
			}
			await opts.afterRemove?.();
		} finally {
			busy = false;
		}
	}

	function label(path: string): string {
		return opts.labelFor?.(path) || path;
	}

	function notifySaved(changed: string[], successMessage: string, fresh?: ShadowedEntry[]) {
		const hits = shadowedHits(changed, fresh ?? entries);
		if (hits.length === 0) {
			toast.success(successMessage);
			return;
		}
		const envHits = hits.filter((e) => e.source === 'environment');
		const envs = envHits.map((e) => e.environment ?? '').filter((v, i, all) => all.indexOf(v) === i);
		const hasServer = hits.some((e) => e.source === 'server');
		let message: string;
		if (hits.length === 1) {
			const e = hits[0];
			const params = { field: label(e.path), value: shadowValueText(e.value), env: e.environment ?? '' };
			message = e.source === 'server'
				? i18n.t('ADMIN_NEXT.CONFIG.SHADOWED.SAVED_SERVER', params)
				: i18n.t('ADMIN_NEXT.CONFIG.SHADOWED.SAVED_ENV', params);
		} else if (!hasServer && envs.length === 1) {
			message = i18n.t('ADMIN_NEXT.CONFIG.SHADOWED.SAVED_MANY_ENV', { count: hits.length, env: envs[0] });
		} else if (envHits.length === 0) {
			message = i18n.t('ADMIN_NEXT.CONFIG.SHADOWED.SAVED_MANY_SERVER', { count: hits.length });
		} else {
			message = i18n.t('ADMIN_NEXT.CONFIG.SHADOWED.SAVED_MANY_MIXED', { count: hits.length, env: envs.join(', ') });
		}
		toast.warning(message, {
			duration: 12000,
			action:
				envHits.length > 0 && opts.canWrite()
					? { label: i18n.t('ADMIN_NEXT.CONFIG.SHADOWED.REMOVE_OVERRIDE'), onClick: () => remove(envHits) }
					: undefined,
		});
	}

	const ctx: ConfigShadowedCtx = {
		get entries() {
			return entries;
		},
		forField: (path: string) => shadowForField(path, entries),
		get canRemove() {
			return opts.canWrite();
		},
		get busy() {
			return busy;
		},
		remove,
		switchTo: (environment: string) => {
			switchEnvironment(environment);
		},
	};

	setContext(CONFIG_SHADOWED_CTX, ctx);

	return {
		get entries() {
			return entries;
		},
		get canRemove() {
			return opts.canWrite();
		},
		get busy() {
			return busy;
		},
		forField: ctx.forField,
		remove,
		switchTo: ctx.switchTo,
		ingest(list) {
			entries = list ?? [];
		},
		notifySaved,
	};
}
