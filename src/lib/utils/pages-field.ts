/**
 * The classic `pages` field options that decide which pages the picker lists
 * (`start_route`, `show_all`, `show_modular`, `limit_levels`), read the way
 * classic admin reads them in `Pages::getList()`.
 *
 * Differences from classic, on purpose: modules stay hidden unless
 * `show_modular` is set (admin2 always did this, classic shows them whenever
 * `show_all` is on), and the start page itself isn't listed, only what is
 * below it.
 */

export interface PagesFieldScope {
	/** Route the list starts below, `/` for the whole site. */
	start: string;
	showAll: boolean;
	showModular: boolean;
	/** Levels of pages listed below `start`, or null for no limit. */
	levels: number | null;
}

interface ScopeField {
	start_route?: unknown;
	show_all?: unknown;
	show_modular?: unknown;
	limit_levels?: unknown;
}

interface ListedPage {
	template?: string | null;
	folder?: string | null;
	routable?: boolean;
}

/** `blog/`, `/blog/` and ` /blog` all mean `/blog`; anything empty is the site root. */
export function normalizeStartRoute(value: unknown): string {
	if (typeof value !== 'string') return '/';
	const trimmed = value.trim().replace(/^\/+|\/+$/g, '');
	return trimmed === '' ? '/' : `/${trimmed}`;
}

export function pagesFieldScope(field: ScopeField): PagesFieldScope {
	// Classic lists the start page at level 0 (the site root isn't listed) and
	// stops before level `limit_levels`, so `limit_levels: 2` is one level of
	// pages below the start. A limit of 1 would list nothing at all, so it
	// counts as one level too.
	const limit = Number(field.limit_levels);
	const levels = Number.isFinite(limit) && limit > 0 ? Math.max(1, Math.floor(limit) - 1) : null;

	return {
		start: normalizeStartRoute(field.start_route),
		showAll: field.show_all !== false,
		showModular: field.show_modular === true,
		levels,
	};
}

export function isModulePage(page: ListedPage): boolean {
	return (page.template ?? '').startsWith('modular/') || (page.folder ?? '').startsWith('_');
}

/** Whether the picker lists this page (its subtree goes with it when it doesn't). */
export function isListedPage(page: ListedPage, scope: PagesFieldScope): boolean {
	if (isModulePage(page)) return scope.showModular;
	return scope.showAll || page.routable !== false;
}

/** Whether a row at `depth` (0 = the first level below the start) may open. */
export function canExpandAt(depth: number, scope: PagesFieldScope): boolean {
	return scope.levels === null || depth + 1 < scope.levels;
}

/**
 * Whether a page found by search sits inside the listed part of the tree:
 * below the start route, and no deeper than the level limit.
 */
export function isInScope(route: string, scope: PagesFieldScope): boolean {
	const segments = (r: string) => r.split('/').filter(Boolean).length;
	if (scope.start !== '/' && !route.startsWith(`${scope.start}/`)) return false;
	const depth = segments(route) - segments(scope.start);
	return depth >= 1 && (scope.levels === null || depth <= scope.levels);
}
