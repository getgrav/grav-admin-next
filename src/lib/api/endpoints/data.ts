import { api, expectArray } from '../client';
import { invalidations } from '$lib/stores/invalidation.svelte';

interface ResolvedOption {
	value: string;
	label: string;
}

const PATH = '/data/resolve';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Option lists can be built from the page tree (parent pickers, page lists),
// so pages being added, removed or moved clears them as well. Plugin, theme
// and config changes are already handled by the client's short cache.
const PAGE_COUNT_ACTIONS = new Set(['create', 'delete', 'move', 'copy', 'list']);
invalidations.subscribe('pages:*', (event) => {
	if (PAGE_COUNT_ACTIONS.has(event.action)) clearDataCache();
});

/**
 * Resolve a PHP data-options@ callable via the API.
 *
 * Results are reused for five minutes, and selects that ask for the same
 * callable at the same time share one request (see ApiClient.get).
 *
 * @param callable - The PHP callable string (e.g. '\Grav\Common\Page\Pages::pageTypes')
 * @param params - Optional extra query params (e.g. { type: 'modular' })
 */
export async function resolveDataOptions(
	callable: string,
	params?: Record<string, string>
): Promise<ResolvedOption[]> {
	const query: Record<string, string> = { callable, ...params };
	// Never cache a non-list: every caller treats the result as an array.
	const data = await api.getCached<unknown>(PATH, query, CACHE_TTL);
	if (!Array.isArray(data)) clearDataCache();
	return expectArray<ResolvedOption>(data, 'GET', PATH);
}

/** Clear the data resolver cache */
export function clearDataCache(): void {
	api.clearShortCache(PATH);
}
