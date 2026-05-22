import { api } from '$lib/api/client';
import { invalidations } from './invalidation.svelte';
import type { PageSummary } from '$lib/api/endpoints/pages';

/**
 * Query shape for a stream. Any combination of filters that the server
 * accepts on `GET /pages` — same field names as the API. The stream key is
 * derived from this object plus the chunk size, so the store deduplicates
 * identical queries.
 */
export interface StreamConfig {
	children_of?: string;
	parent?: string;
	root?: boolean;
	template?: string;
	published?: boolean;
	visible?: boolean;
	routable?: boolean;
	search?: string;
	sort?: string;
	order?: 'asc' | 'desc';
	lang?: string;
	translations?: boolean;
}

interface StreamState {
	config: StreamConfig;
	perPage: number;
	/** Number of rows in the full sequence; null until first chunk lands. */
	total: number | null;
	/** Loaded pages keyed by 1-based page number. */
	chunks: Record<number, PageSummary[]>;
	/** Pages with an in-flight request — used to dedupe concurrent loads. */
	loading: Record<number, boolean>;
}

interface ChunkResponseBody {
	data?: PageSummary[];
	meta?: {
		pagination?: {
			page?: number;
			per_page?: number;
			total?: number;
			total_pages?: number;
			located_at_index?: number;
		};
	};
}

function createPagesChunksStore() {
	// Keyed by streamKey. Each entry is the full state for one stream.
	let streams = $state<Record<string, StreamState>>({});

	function ensureStream(key: string, config: StreamConfig, perPage: number): StreamState {
		if (!streams[key]) {
			streams[key] = {
				config: { ...config },
				perPage,
				total: null,
				chunks: {},
				loading: {},
			};
		}
		// IMPORTANT: return the value re-read from `streams` so callers get
		// the $state proxy. The literal we assigned above is a plain object —
		// mutating *that* would bypass reactivity.
		return streams[key]!;
	}

	function buildParams(config: StreamConfig, perPage: number, extra: { page?: number; locate?: string }): Record<string, string> {
		const params: Record<string, string> = { per_page: String(perPage) };
		if (config.children_of) params.children_of = config.children_of;
		if (config.parent) params.parent = config.parent;
		if (config.root) params.root = 'true';
		if (config.template) params.template = config.template;
		if (config.published !== undefined) params.published = String(config.published);
		if (config.visible !== undefined) params.visible = String(config.visible);
		if (config.routable !== undefined) params.routable = String(config.routable);
		if (config.search) params.search = config.search;
		if (config.sort) params.sort = config.sort;
		if (config.order) params.order = config.order;
		if (config.lang) params.lang = config.lang;
		if (config.translations) params.translations = 'true';
		if (extra.page) params.page = String(extra.page);
		if (extra.locate) params.locate = extra.locate;
		return params;
	}

	async function fetchPage(key: string, config: StreamConfig, perPage: number, page: number): Promise<void> {
		const s = ensureStream(key, config, perPage);
		if (s.chunks[page] || s.loading[page]) return;
		s.loading[page] = true;
		try {
			const body = await api.getFullBody<ChunkResponseBody>('/pages', buildParams(config, perPage, { page }));
			s.total = body.meta?.pagination?.total ?? s.total;
			s.chunks[page] = body.data ?? [];
		} finally {
			s.loading[page] = false;
		}
	}

	/**
	 * Ensure the chunk containing absolute row index `index` is loaded. No-op
	 * if it's already loaded or in flight. Returns when the load settles
	 * (resolved either way — call sites can render placeholders meanwhile).
	 */
	async function ensureChunkForIndex(key: string, config: StreamConfig, perPage: number, index: number): Promise<void> {
		const page = Math.max(1, Math.floor(index / perPage) + 1);
		return fetchPage(key, config, perPage, page);
	}

	/**
	 * Use the server's `?locate=` parameter to find and load the chunk
	 * containing `route`. Returns the located row's absolute index, or null
	 * if the route isn't in the result set.
	 */
	async function ensureChunkForRoute(
		key: string,
		config: StreamConfig,
		perPage: number,
		route: string,
	): Promise<number | null> {
		const s = ensureStream(key, config, perPage);
		const body = await api.getFullBody<ChunkResponseBody>(
			'/pages',
			buildParams(config, perPage, { locate: route }),
		);
		const meta = body.meta?.pagination;
		if (!meta) return null;
		const page = meta.page ?? 1;
		s.total = meta.total ?? s.total;
		s.chunks[page] = body.data ?? [];
		return meta.located_at_index ?? null;
	}

	/** Drop one stream. Next read triggers a fresh load. */
	function invalidate(key: string): void {
		delete streams[key];
	}

	/** Drop every stream. Called automatically on `pages:*` invalidation events. */
	function invalidateAll(): void {
		for (const k of Object.keys(streams)) delete streams[k];
	}

	/**
	 * Look up a row at absolute index. Returns null if the chunk isn't loaded
	 * — callers should render a placeholder and let an effect / observer
	 * trigger `ensureChunkForIndex` when the row enters the viewport.
	 */
	function getRow(key: string, index: number): PageSummary | null {
		const s = streams[key];
		if (!s) return null;
		const page = Math.floor(index / s.perPage) + 1;
		const chunk = s.chunks[page];
		if (!chunk) return null;
		return chunk[index % s.perPage] ?? null;
	}

	function getTotal(key: string): number | null {
		return streams[key]?.total ?? null;
	}

	function isChunkLoaded(key: string, index: number): boolean {
		const s = streams[key];
		if (!s) return false;
		const page = Math.floor(index / s.perPage) + 1;
		return s.chunks[page] !== undefined;
	}

	function isChunkLoading(key: string, index: number): boolean {
		const s = streams[key];
		if (!s) return false;
		const page = Math.floor(index / s.perPage) + 1;
		return !!s.loading[page];
	}

	/** Currently-loaded row count across all chunks of this stream. */
	function getLoadedCount(key: string): number {
		const s = streams[key];
		if (!s) return 0;
		let n = 0;
		for (const k of Object.keys(s.chunks)) n += s.chunks[Number(k)]!.length;
		return n;
	}

	/**
	 * Load every chunk for a stream. Used when the caller needs the full
	 * sequence resident in memory — e.g. before reordering, which sends
	 * positions for the whole sibling list. Resolves when every chunk has
	 * settled. Safe to call repeatedly: already-loaded / in-flight chunks
	 * are not re-fetched.
	 */
	async function ensureAllChunks(key: string, config: StreamConfig, perPage: number): Promise<void> {
		// Bootstrap first chunk to learn the total.
		await fetchPage(key, config, perPage, 1);
		const s = streams[key];
		if (!s || s.total === null || s.total === 0) return;
		const totalPages = Math.max(1, Math.ceil(s.total / perPage));
		const jobs: Promise<void>[] = [];
		for (let p = 2; p <= totalPages; p++) jobs.push(fetchPage(key, config, perPage, p));
		await Promise.all(jobs);
	}

	// `pages:*` events fire on any page mutation (create/update/delete/move).
	// Drop every cached chunk so the next read re-fetches with fresh data.
	invalidations.subscribe('pages:*', () => invalidateAll());

	return {
		ensureChunkForIndex,
		ensureChunkForRoute,
		ensureAllChunks,
		invalidate,
		invalidateAll,
		getRow,
		getTotal,
		isChunkLoaded,
		isChunkLoading,
		getLoadedCount,
	};
}

export const pagesChunks = createPagesChunksStore();

/**
 * Build a stable key for a stream from its config + chunk size. Identical
 * configs share a stream and its loaded chunks; changing any filter or the
 * chunk size starts a new stream (the old one stays cached until invalidated).
 */
export function streamKey(config: StreamConfig, perPage: number): string {
	const keys = Object.keys(config).sort() as (keyof StreamConfig)[];
	const parts: string[] = [];
	for (const k of keys) {
		const v = config[k];
		if (v === undefined || v === '') continue;
		parts.push(`${k}=${v}`);
	}
	return `${parts.join('&')}|pp=${perPage}`;
}
