import { api } from '../client';

export interface PageSummary {
	route: string;
	/**
	 * Structural route for the page — for the home page this is the actual
	 * folder route (e.g. `/home`) rather than the public alias `/`. All API
	 * calls that address a specific page must use this value. `route` is the
	 * public URL and is only meant for display or for matching visible state.
	 */
	raw_route?: string;
	/**
	 * Structural route of the page's parent, from the real hierarchy — `/` for a
	 * genuine top-level page. Use this (not a string-split of the public `route`)
	 * when moving/reparenting: under home.hide_in_urls a home child's public
	 * route drops the home segment, so deriving the parent from it yields `/` and
	 * relocates the page to the site root (admin2#132).
	 */
	parent_route?: string;
	title: string;
	menu: string;
	template: string;
	slug: string;
	/** On-disk folder basename, including any numeric ordering prefix (e.g. `01.consulting`). `slug` is the prefix-stripped name. */
	folder?: string;
	language: string | null;
	header: Record<string, unknown>;
	taxonomy: Record<string, string[]>;
	published: boolean;
	visible: boolean;
	routable: boolean;
	date: string;
	modified: string;
	order: string | null;
	has_children: boolean;
	translated_languages?: Record<string, string>;
	untranslated_languages?: string[];
	/** True when the page has an untyped base file (e.g. `default.md`) that acts as implicit default-language content. */
	has_default_file?: boolean;
	/** Language codes that have an explicit `{template}.{lang}.md` file on disk. Languages in `translated_languages` but NOT in this list are served by the implicit `default.md` fallback. */
	explicit_language_files?: string[];
}

/**
 * Returns the route that should be used when calling the API for a specific
 * page (fetching, editing, moving, copying, etc). Prefers `raw_route` so the
 * home page resolves to `/home` instead of its public alias `/`.
 */
export function pageApiRoute(page: { route: string; raw_route?: string | null }): string {
	return page.raw_route || page.route;
}

export interface PageDetail extends PageSummary {
	content?: string;
	content_html?: string;
	summary?: string;
	media?: PageMedia[];
	children?: PageSummary[];
	translated_languages?: Record<string, string>;
	untranslated_languages?: string[];
	has_default_file?: boolean;
	explicit_language_files?: string[];
}

export interface PageMedia {
	filename: string;
	url: string;
	thumbnail_url?: string;
	type: string;
	size: number;
}

export interface PaginatedPages {
	data: PageSummary[];
	meta: {
		pagination: {
			page: number;
			per_page: number;
			total: number;
			total_pages: number;
		};
	};
	links: Record<string, string>;
}

export interface PageListParams {
	page?: number;
	per_page?: number;
	sort?: 'date' | 'title' | 'slug' | 'modified' | 'order';
	order?: 'asc' | 'desc';
	published?: boolean;
	template?: string;
	routable?: boolean;
	visible?: boolean;
	parent?: string;
	children_of?: string;
	root?: boolean;
	lang?: string;
	translations?: boolean;
	search?: string;
}

/** Strip the last segment of a route to get its parent. Root is '/'. */
export function parentRouteOf(route: string): string {
	const parts = route.split('/').filter(Boolean);
	if (parts.length <= 1) return '/';
	return '/' + parts.slice(0, -1).join('/');
}

export async function getChildren(parentRoute: string, sort: string = 'order', order: string = 'asc', lang?: string, translations?: boolean): Promise<PageSummary[]> {
	const perPage = 200;
	const baseParams: Record<string, string> = {
		children_of: parentRoute,
		sort,
		order,
		per_page: String(perPage),
	};
	if (lang) baseParams.lang = lang;
	if (translations) baseParams.translations = 'true';

	type ChildrenBody = {
		data?: PageSummary[];
		meta?: { pagination?: { total_pages?: number } };
	};

	const first = await api.getFullBody<ChildrenBody>('/pages', { ...baseParams, page: '1' });
	const totalPages = Math.max(1, first.meta?.pagination?.total_pages ?? 1);
	const all: PageSummary[] = [...(first.data ?? [])];

	if (totalPages > 1) {
		const rest = await Promise.all(
			Array.from({ length: totalPages - 1 }, (_, i) =>
				api
					.getFullBody<ChildrenBody>('/pages', { ...baseParams, page: String(i + 2) })
					.then((body) => body.data ?? []),
			),
		);
		for (const batch of rest) all.push(...batch);
	}

	return all;
}

export interface CreatePageBody {
	route: string;
	title: string;
	/** 'page' = folder + <template>.md (default). 'folder' = folder only, no
	 *  .md written. 'module' = folder gets a leading `_` (Grav's modular
	 *  sub-page convention) and .md is still written. */
	kind?: 'page' | 'folder' | 'module';
	template?: string;
	content?: string;
	header?: Record<string, unknown>;
	order?: number | 'auto';
	lang?: string;
}

export interface UpdatePageBody {
	title?: string;
	content?: string;
	template?: string;
	published?: boolean;
	visible?: boolean;
	header?: Record<string, unknown>;
	// Expert (raw-frontmatter) mode sends the complete header and sets this to
	// 'replace' so the API replaces the header wholesale instead of merging —
	// otherwise deleted keys survive the merge and reappear (admin2#102).
	header_mode?: 'replace';
}

function toParams(p: PageListParams): Record<string, string> {
	const params: Record<string, string> = {};
	if (p.page) params.page = String(p.page);
	if (p.per_page) params.per_page = String(p.per_page);
	if (p.sort) params.sort = p.sort;
	if (p.order) params.order = p.order;
	if (p.published !== undefined) params.published = String(p.published);
	if (p.template) params.template = p.template;
	if (p.routable !== undefined) params.routable = String(p.routable);
	if (p.visible !== undefined) params.visible = String(p.visible);
	if (p.parent) params.parent = p.parent;
	if (p.children_of) params.children_of = p.children_of;
	if (p.root) params.root = 'true';
	if (p.lang) params.lang = p.lang;
	if (p.translations) params.translations = 'true';
	if (p.search) params.search = p.search;
	return params;
}

export async function getPages(params: PageListParams = {}): Promise<PaginatedPages> {
	// For paginated response, we need the full envelope (not just data)
	const result = await api.get<PageSummary[]>('/pages', toParams(params));
	// The API client unwraps data, but we need pagination meta too
	// For now, wrap it back — we'll refine this later
	return { data: result, meta: { pagination: { page: params.page ?? 1, per_page: params.per_page ?? 20, total: 0, total_pages: 0 } }, links: {} };
}

export async function getPagesList(params: PageListParams = {}): Promise<PageSummary[]> {
	return api.get<PageSummary[]>('/pages', toParams(params));
}

/**
 * Full-site page search (server-side). Queries against title, route, template.
 * Returns a flat list of matching pages across the entire site.
 */
export async function searchPages(
	query: string,
	options?: { lang?: string; translations?: boolean; per_page?: number },
): Promise<PageSummary[]> {
	return api.get<PageSummary[]>('/pages', toParams({
		search: query,
		per_page: options?.per_page ?? 500,
		lang: options?.lang,
		translations: options?.translations,
	}));
}

export async function getRecentPages(limit = 5): Promise<PageSummary[]> {
	return api.get<PageSummary[]>('/pages', {
		sort: 'modified',
		order: 'desc',
		per_page: String(limit)
	});
}

export async function getPage(route: string, options?: { render?: boolean; summary?: boolean; summary_size?: number; children?: boolean; children_depth?: number; translations?: boolean; lang?: string }): Promise<PageDetail> {
	const params: Record<string, string> = {};
	if (options?.render) params.render = 'true';
	if (options?.summary) params.summary = 'true';
	if (options?.summary_size) params.summary_size = String(options.summary_size);
	if (options?.children) params.children = 'true';
	if (options?.children_depth) params.children_depth = String(options.children_depth);
	if (options?.translations) params.translations = 'true';
	if (options?.lang) params.lang = options.lang;
	const cleanRoute = route.startsWith('/') ? route.slice(1) : route;
	return api.get<PageDetail>(`/pages/${cleanRoute}`, params);
}

export async function createPage(body: CreatePageBody): Promise<PageDetail> {
	return api.post<PageDetail>('/pages', body);
}

/**
 * Mint a short-lived, route-scoped token that lets the front-end render this
 * page even when it is unpublished, so the editor's preview works for drafts
 * (getgrav/grav-plugin-admin2#100). The token is appended to the preview URL
 * alongside `admin_preview=1`; the API plugin validates it and force-publishes
 * only this one page for that request.
 */
export async function getPagePreviewToken(route: string): Promise<{ token: string; expires_in: number }> {
	const cleanRoute = route.startsWith('/') ? route.slice(1) : route;
	return api.post<{ token: string; expires_in: number }>(`/pages/${cleanRoute}/preview-token`, {});
}

export async function updatePage(route: string, body: UpdatePageBody, etag?: string, lang?: string): Promise<PageDetail> {
	const cleanRoute = route.startsWith('/') ? route.slice(1) : route;
	const path = lang ? `/pages/${cleanRoute}?lang=${encodeURIComponent(lang)}` : `/pages/${cleanRoute}`;
	// TODO: add If-Match header support for ETags
	return api.patch<PageDetail>(path, body);
}

export async function deletePage(route: string, options?: { children?: boolean; lang?: string }): Promise<void> {
	const cleanRoute = route.startsWith('/') ? route.slice(1) : route;
	const queryParts: string[] = [];
	if (options?.children !== undefined) queryParts.push(`children=${options.children}`);
	if (options?.lang) queryParts.push(`lang=${encodeURIComponent(options.lang)}`);
	const path = queryParts.length ? `/pages/${cleanRoute}?${queryParts.join('&')}` : `/pages/${cleanRoute}`;
	return api.delete(path, undefined);
}

export async function movePage(route: string, body: { parent: string; slug?: string; order?: number | null }): Promise<PageDetail> {
	const cleanRoute = route.startsWith('/') ? route.slice(1) : route;
	return api.post<PageDetail>(`/pages/${cleanRoute}/move`, body);
}

export async function copyPage(route: string, destination: string): Promise<PageDetail> {
	const cleanRoute = route.startsWith('/') ? route.slice(1) : route;
	return api.post<PageDetail>(`/pages/${cleanRoute}/copy`, { route: destination });
}

/**
 * High-level "Duplicate this page" — mirrors admin-classic's taskCopy(): walk
 * the parent's children to pick the next free `{slug}-N`, copy the folder,
 * then bump the trailing number in the title (or append ` 2`). Used by the
 * pages list/tree/columns hover actions and by the page editor's Copy button
 * so all four paths yield the same on-disk + frontmatter result.
 */
export async function duplicatePage(page: Pick<PageSummary, 'route' | 'raw_route' | 'slug' | 'title'>): Promise<PageDetail> {
	const sourceRoute = pageApiRoute(page);
	const parentRoute = sourceRoute === '/' ? '/' : (sourceRoute.substring(0, sourceRoute.lastIndexOf('/')) || '/');

	// Strip a trailing `-N` so `foo-3` duplicates to `foo-4`, not `foo-3-2`.
	const slugMatch = page.slug.match(/^(.*?)(?:-(\d+))?$/);
	const baseSlug = slugMatch?.[1] || page.slug;
	const startN = slugMatch?.[2] ? Number(slugMatch[2]) + 1 : 2;

	const siblings = await getChildren(parentRoute);
	const existingSlugs = new Set(siblings.map((p) => p.slug));
	let n = startN;
	while (existingSlugs.has(`${baseSlug}-${n}`)) n++;
	const newSlug = `${baseSlug}-${n}`;
	const destination = parentRoute === '/' ? `/${newSlug}` : `${parentRoute}/${newSlug}`;

	const newPage = await copyPage(sourceRoute, destination);

	// Increment a trailing number in the title (matches admin-classic). Title
	// bump is best-effort: a failure here still leaves the duplicated folder
	// in place, so the user just sees the source title until they edit it.
	const titleMatch = page.title.match(/^(.*?)(\d+)\s*$/);
	const newTitle = titleMatch ? `${titleMatch[1]}${Number(titleMatch[2]) + 1}` : `${page.title} 2`;
	try {
		await updatePage(newPage.route, { title: newTitle });
	} catch {
		/* non-fatal */
	}

	return newPage;
}

export interface ReorganizeOperation {
	route: string;
	parent?: string;
	position?: number;
}

export interface ReorganizeResult {
	route: string;
	slug: string;
	title: string;
	order: number | null;
	parent: string;
}

export async function reorganizePages(operations: ReorganizeOperation[]): Promise<ReorganizeResult[]> {
	return api.post<ReorganizeResult[]>('/pages/reorganize', { operations });
}
