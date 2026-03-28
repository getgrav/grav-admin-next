import { api } from '../client';

export interface ConfigResponse {
	data: Record<string, unknown>;
	etag: string;
}

/**
 * Get the list of available configuration sections.
 */
export async function getConfigSections(): Promise<string[]> {
	return api.get<string[]>('/config');
}

/**
 * Get configuration data for a scope, along with its ETag.
 */
export async function getConfig(scope: string): Promise<ConfigResponse> {
	const { data, headers } = await api.requestRaw<Record<string, unknown>>(
		'GET',
		`/config/${scope}`
	);
	return {
		data,
		etag: headers.get('etag')?.replace(/"/g, '') ?? ''
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

	const { data: responseData, headers: responseHeaders } = await api.requestRaw<
		Record<string, unknown>
	>('PATCH', `/config/${scope}`, {
		body: data,
		headers
	});

	return {
		data: responseData,
		etag: responseHeaders.get('etag')?.replace(/"/g, '') ?? ''
	};
}
