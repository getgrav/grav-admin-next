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
	title: string;
	menu: string;
	template: string;
	slug: string;
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
	const params: Record<string, string> = {
		children_of: parentRoute,
		sort,
		order,
		per_page: '200',
	};
	if (lang) params.lang = lang;
	if (translations) params.translations = 'true';
	return api.get<PageSummary[]>('/pages', params);
}

export interface CreatePageBody {
	route: string;
	title: string;
	template?: string;
	content?: string;
	header?: Record<string, unknown>;
	order?: number;
	lang?: string;
}

export interface UpdatePageBody {
	title?: string;
	content?: string;
	template?: string;
	published?: boolean;
	visible?: boolean;
	header?: Record<string, unknown>;
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
