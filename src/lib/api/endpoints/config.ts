import { api } from '../client';
import { extractEtag } from '$lib/utils/etag';

export interface ConfigResponse {
	data: Record<string, unknown>;
	etag: string;
	/** Dotted leaf paths the active layer's file actually overrides. */
	overrides: string[];
	/** For each overridden path, the value it would revert to. */
	fallback: Record<string, unknown>;
}

interface OverrideMeta {
	overrides?: string[];
	fallback?: Record<string, unknown>;
}

function readOverrideMeta(meta: unknown): { overrides: string[]; fallback: Record<string, unknown> } {
	const m = (meta ?? {}) as OverrideMeta;
	return { overrides: m.overrides ?? [], fallback: m.fallback ?? {} };
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
 */
export async function revertConfig(
	scope: string,
	payload: { keys?: string[]; reset?: boolean },
	etag?: string
): Promise<ConfigResponse> {
	const headers: Record<string, string> = {};
	if (etag) {
		headers['If-Match'] = `"${etag}"`;
	}
	const { data, meta, headers: responseHeaders } = await api.requestRaw<Record<string, unknown>>(
		'POST',
		`/config/${scope}/revert`,
		{ body: payload, headers }
	);
	return {
		data,
		etag: responseHeaders.get('etag')?.replace(/"/g, '') ?? '',
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
		etag: responseHeaders.get('etag')?.replace(/"/g, '') ?? '',
		...readOverrideMeta(meta)
	};
}
