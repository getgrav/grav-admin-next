import { api, expectArray } from '../client';

interface ResolvedOption {
	value: string;
	label: string;
}

/** In-memory cache for resolved data directives */
const cache = new Map<string, { data: ResolvedOption[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Resolve a PHP data-options@ callable via the API.
 * Results are cached client-side to avoid repeated calls.
 *
 * @param callable - The PHP callable string (e.g. '\Grav\Common\Page\Pages::pageTypes')
 * @param params - Optional extra query params (e.g. { type: 'modular' })
 */
export async function resolveDataOptions(
	callable: string,
	params?: Record<string, string>
): Promise<ResolvedOption[]> {
	const cacheKey = callable + (params ? '?' + new URLSearchParams(params).toString() : '');
	const cached = cache.get(cacheKey);
	if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
		return cached.data;
	}

	const query: Record<string, string> = { callable, ...params };
	// Never cache a non-list: every caller treats the result as an array.
	const data = expectArray<ResolvedOption>(await api.get<unknown>('/data/resolve', query), 'GET', '/data/resolve');
	cache.set(cacheKey, { data, timestamp: Date.now() });
	return data;
}

/** Clear the data resolver cache */
export function clearDataCache(): void {
	cache.clear();
}
