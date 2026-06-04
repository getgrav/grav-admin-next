import { setContext } from 'svelte';
import { toast } from 'svelte-sonner';
import { i18n } from '$lib/stores/i18n.svelte';
import { revertConfig } from '$lib/api/endpoints/config';
import type { ConfigOverridesCtx } from '$lib/components/blueprint/FieldOverrideIndicator.svelte';

/** Dig a dotted path out of a nested object, or undefined if any segment is missing. */
function getPath(obj: Record<string, unknown>, path: string): unknown {
	let cur: unknown = obj;
	for (const part of path.split('.')) {
		if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
		cur = (cur as Record<string, unknown>)[part];
	}
	return cur;
}

export interface ConfigOverridesController {
	readonly overrides: string[];
	readonly fallback: Record<string, unknown>;
	readonly reverting: boolean;
	showResetModal: boolean;
	/** Record the override map from a config load/save response. */
	ingest(meta: { overrides: string[]; fallback: Record<string, unknown> }): void;
	/** Run the full-scope reset (bind to the confirm modal's onconfirm). */
	reset(): Promise<void>;
}

/**
 * Wire the per-field override indicators + revert/reset for a config form.
 *
 * Sets the `configOverrides` Svelte context that {@link FieldOverrideIndicator}
 * reads, and owns the override-map state. The host page supplies the scope, the
 * write permission, the current ETag, and two callbacks to fold a revert result
 * back into its own form state. See docs/config-overrides-revert.md.
 */
export function provideConfigOverrides(opts: {
	scope: () => string;
	canWrite: () => boolean;
	etag: () => string;
	/** Apply a single reverted field's new value (and the new ETag) to the form. */
	applyFieldRevert: (path: string, newValue: unknown, etag: string) => void;
	/** Replace the whole form after a scope reset. */
	applyReset: (data: Record<string, unknown>, etag: string) => void;
}): ConfigOverridesController {
	let overrides = $state<string[]>([]);
	let fallback = $state<Record<string, unknown>>({});
	let reverting = $state(false);
	let showResetModal = $state(false);

	function handleError(err: unknown) {
		const status = err && typeof err === 'object' && 'status' in err ? (err as { status: number }).status : 0;
		toast.error(
			status === 409
				? i18n.t('ADMIN_NEXT.CONFIG.CONFIGURATION_WAS_MODIFIED_ELSEWHERE')
				: i18n.t('ADMIN_NEXT.CONFIG.OVERRIDE.REVERT_FAILED')
		);
	}

	async function revertField(path: string) {
		if (!opts.canWrite() || reverting) return;
		reverting = true;
		try {
			const result = await revertConfig(opts.scope(), { keys: [path] }, opts.etag());
			opts.applyFieldRevert(path, getPath(result.data, path), result.etag);
			overrides = result.overrides;
			fallback = result.fallback;
			toast.success(i18n.t('ADMIN_NEXT.CONFIG.OVERRIDE.REVERTED'));
		} catch (err) {
			handleError(err);
		} finally {
			reverting = false;
		}
	}

	async function reset() {
		showResetModal = false;
		if (!opts.canWrite() || reverting) return;
		reverting = true;
		try {
			const result = await revertConfig(opts.scope(), { reset: true }, opts.etag());
			opts.applyReset(result.data, result.etag);
			overrides = result.overrides;
			fallback = result.fallback;
			toast.success(i18n.t('ADMIN_NEXT.CONFIG.OVERRIDE.RESET_DONE'));
		} catch (err) {
			handleError(err);
		} finally {
			reverting = false;
		}
	}

	setContext('configOverrides', {
		isOverridden: (path: string) => overrides.includes(path),
		getFallback: (path: string) => fallback[path],
		revert: (path: string) => revertField(path),
		get canRevert() {
			return opts.canWrite();
		},
	} satisfies ConfigOverridesCtx);

	return {
		get overrides() {
			return overrides;
		},
		get fallback() {
			return fallback;
		},
		get reverting() {
			return reverting;
		},
		get showResetModal() {
			return showResetModal;
		},
		set showResetModal(v: boolean) {
			showResetModal = v;
		},
		ingest(meta) {
			overrides = meta.overrides;
			fallback = meta.fallback;
		},
		reset,
	};
}
