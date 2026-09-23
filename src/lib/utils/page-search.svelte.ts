/**
 * Debounced, abortable full-site page search shared by the Tree, List and
 * Columns views.
 *
 * Every new query aborts the request before it, so a slow reply for "ab" can
 * never land after, and overwrite, the results for "abc". Results come in
 * pages of `limit` (100 by default); `more()` appends the next page.
 */
import { searchPages, type PageSummary } from '$lib/api/endpoints/pages';

export const PAGE_SEARCH_LIMIT = 100;

interface PageSearchOptions {
	/** Extra query params, read when each request goes out. */
	params?: () => { lang?: string; translations?: boolean };
	debounceMs?: number;
	limit?: number;
}

export function createPageSearch(options: PageSearchOptions = {}) {
	const debounceMs = options.debounceMs ?? 250;
	const limit = options.limit ?? PAGE_SEARCH_LIMIT;

	let results = $state.raw<PageSummary[]>([]);
	let total = $state(0);
	/** A first page is on its way (the list is being replaced). */
	let loading = $state(false);
	/** A further page is on its way (the list is being extended). */
	let loadingMore = $state(false);

	let query = '';
	let nextPage = 2;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let controller: AbortController | null = null;

	function cancel() {
		if (timer) clearTimeout(timer);
		timer = null;
		controller?.abort();
		controller = null;
	}

	async function fetchPage(page: number) {
		const current = new AbortController();
		controller = current;
		if (page === 1) loading = true;
		else loadingMore = true;
		try {
			const res = await searchPages(query, {
				...options.params?.(),
				per_page: limit,
				page,
				signal: current.signal,
			});
			if (current.signal.aborted) return;
			results = page === 1 ? res.pages : [...results, ...res.pages];
			total = Math.max(res.total, results.length);
			nextPage = page + 1;
		} catch {
			if (current.signal.aborted) return;
			if (page === 1) {
				results = [];
				total = 0;
			}
		} finally {
			if (controller === current) {
				controller = null;
				loading = false;
				loadingMore = false;
			}
		}
	}

	return {
		get results() { return results; },
		get total() { return total; },
		get loading() { return loading; },
		get loadingMore() { return loadingMore; },
		/** More matches exist on the server than are loaded. */
		get hasMore() { return results.length < total; },

		/** Search for `text` after the debounce; empty text clears the results. */
		run(text: string) {
			cancel();
			loadingMore = false;
			query = text.trim();
			if (!query) {
				results = [];
				total = 0;
				loading = false;
				loadingMore = false;
				return;
			}
			loading = true;
			timer = setTimeout(() => {
				timer = null;
				void fetchPage(1);
			}, debounceMs);
		},

		/** Re-run the current query now, e.g. after pages changed. */
		refresh() {
			if (!query) return;
			cancel();
			void fetchPage(1);
		},

		/** Load the next page of matches onto the end of the list. */
		more() {
			if (!query || loading || loadingMore || results.length >= total) return;
			void fetchPage(nextPage);
		},

		/** Stop any pending search; call when the view goes away. */
		dispose: cancel,
	};
}
