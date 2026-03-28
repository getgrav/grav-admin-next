import { api } from '../client';

export interface PageSummary {
	route: string;
	title: string;
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
}

export interface PageDetail extends PageSummary {
	content?: string;
	content_html?: string;
	summary?: string;
	media?: PageMedia[];
	children?: PageSummary[];
	translated_languages?: Record<string, boolean>;
	untranslated_languages?: Record<string, boolean>;
}

export interface PageMedia {
	filename: string;
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
}

export async function getChildren(parentRoute: string, sort: string = 'order', order: string = 'asc'): Promise<PageSummary[]> {
	return api.get<PageSummary[]>('/pages', {
		children_of: parentRoute,
		sort,
		order,
		per_page: '200'
	});
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

export async function getRecentPages(limit = 5): Promise<PageSummary[]> {
	return api.get<PageSummary[]>('/pages', {
		sort: 'modified',
		order: 'desc',
		per_page: String(limit)
	});
}

export async function getPage(route: string, options?: { render?: boolean; summary?: boolean; summary_size?: number; children?: boolean; children_depth?: number; translations?: boolean }): Promise<PageDetail> {
	const params: Record<string, string> = {};
	if (options?.render) params.render = 'true';
	if (options?.summary) params.summary = 'true';
	if (options?.summary_size) params.summary_size = String(options.summary_size);
	if (options?.children) params.children = 'true';
	if (options?.children_depth) params.children_depth = String(options.children_depth);
	if (options?.translations) params.translations = 'true';
	const cleanRoute = route.startsWith('/') ? route.slice(1) : route;
	return api.get<PageDetail>(`/pages/${cleanRoute}`, params);
}

export async function createPage(body: CreatePageBody): Promise<PageDetail> {
	return api.post<PageDetail>('/pages', body);
}

export async function updatePage(route: string, body: UpdatePageBody, etag?: string): Promise<PageDetail> {
	const cleanRoute = route.startsWith('/') ? route.slice(1) : route;
	// TODO: add If-Match header support for ETags
	return api.patch<PageDetail>(`/pages/${cleanRoute}`, body);
}

export async function deletePage(route: string, options?: { children?: boolean; lang?: string }): Promise<void> {
	const cleanRoute = route.startsWith('/') ? route.slice(1) : route;
	const params: Record<string, string> = {};
	if (options?.children !== undefined) params.children = String(options.children);
	if (options?.lang) params.lang = options.lang;
	return api.delete(`/pages/${cleanRoute}`, undefined);
}

export async function movePage(route: string, body: { parent: string; slug?: string; order?: number }): Promise<PageDetail> {
	const cleanRoute = route.startsWith('/') ? route.slice(1) : route;
	return api.post<PageDetail>(`/pages/${cleanRoute}/move`, body);
}

export async function copyPage(route: string, destination: string): Promise<PageDetail> {
	const cleanRoute = route.startsWith('/') ? route.slice(1) : route;
	return api.post<PageDetail>(`/pages/${cleanRoute}/copy`, { route: destination });
}
