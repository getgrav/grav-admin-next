import { api } from '../client';
import { extractEtag } from '$lib/utils/etag';
import { readShadowed, type ShadowedEntry } from '$lib/utils/config-shadowed';

export type { ShadowedEntry } from '$lib/utils/config-shadowed';

export interface ConfigResponse {
	data: Record<string, unknown>;
	etag: string;
	/** Dotted leaf paths the active layer's file actually overrides. */
	overrides: string[];
	/** For each overridden path, the value it would revert to. */
	fallback: Record<string, unknown>;
	/**
	 * Keys a layer above the write target sets (the booted environment's file,
	 * or a GRAV_CONFIG server variable), so a value saved here is not what the
	 * site uses. Empty when nothing is shadowed.
	 */
	shadowed: ShadowedEntry[];
}

interface OverrideMeta {
	overrides?: string[];
	fallback?: Record<string, unknown>;
}

export function readOverrideMeta(meta: unknown): {
	overrides: string[];
	fallback: Record<string, unknown>;
	shadowed: ShadowedEntry[];
} {
	const m = (meta ?? {}) as OverrideMeta;
	return { overrides: m.overrides ?? [], fallback: m.fallback ?? {}, shadowed: readShadowed(meta) };
}

/**
 * Get the list of available configuration sections.
 */
export async function getConfigSections(): Promise<string[]> {
	return api.get<string[]>('/config');
}

/**
 * Get configuration data for a scope, along with its ETag and override map.
 */
export async function getConfig(scope: string): Promise<ConfigResponse> {
	const { data, meta, headers } = await api.requestRaw<Record<string, unknown>>(
		'GET',
		`/config/${scope}`
	);
	return {
		data,
		etag: extractEtag(headers),
		...readOverrideMeta(meta)
	};
}

/**
 * Revert overridden config keys (or reset the whole scope) for the active
 * environment layer, letting the value beneath take over.
 *
 * `options.environment` targets another layer for this one call: it replaces
 * the X-Config-Environment header the client derives from the session
 * environment (per-call headers win over the client defaults). Used to remove
 * a key from the booted environment's file while the admin is on "Default".
 * The read header (X-Grav-Environment) is left alone, so the response's data
 * and meta describe that other layer and the caller should re-read its own.
 * If-Match is optional on revert, so no ETag is needed for that layer.
 */
export async function revertConfig(
	scope: string,
	payload: { keys?: string[]; reset?: boolean },
	etag?: string,
	options: { environment?: string } = {}
): Promise<ConfigResponse> {
	const headers: Record<string, string> = {};
	if (etag) {
		headers['If-Match'] = `"${etag}"`;
	}
	if (options.environment) {
		headers['X-Config-Environment'] = options.environment;
	}
	const { data, meta, headers: responseHeaders } = await api.requestRaw<Record<string, unknown>>(
		'POST',
		`/config/${scope}/revert`,
		{ body: payload, headers }
	);
	return {
		data,
		etag: extractEtag(responseHeaders),
		...readOverrideMeta(meta)
	};
}

/**
 * Save configuration data for a scope using PATCH with ETag concurrency control.
 */
export async function saveConfig(
	scope: string,
	data: Record<string, unknown>,
	etag?: string
): Promise<ConfigResponse> {
	const headers: Record<string, string> = {};
	if (etag) {
		headers['If-Match'] = `"${etag}"`;
	}

	const { data: responseData, meta, headers: responseHeaders } = await api.requestRaw<
		Record<string, unknown>
	>('PATCH', `/config/${scope}`, {
		body: data,
		headers
	});

	return {
		data: responseData,
		etag: extractEtag(responseHeaders),
		...readOverrideMeta(meta)
	};
}
