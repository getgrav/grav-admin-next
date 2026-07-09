/**
 * Shared page-list filter model for the Pages views (tree, list, columns).
 *
 * The three views all fetch through the pagesChunks stream store, whose
 * StreamConfig already accepts published/visible/routable/template. This module
 * holds the small UI-facing model (tri-state toggles + a single template) and
 * maps it onto those server-side fields, so every view filters identically and
 * the server does the work (see getgrav/grav-plugin-admin2#121, which fixed the
 * API side so these params actually filter).
 */

/** All = don't filter on this axis; Yes/No = require true/false. */
export type TriState = 'all' | 'yes' | 'no';

export interface PageFilters {
	published: TriState;
	visible: TriState;
	routable: TriState;
	/** Exact template match. Empty string = any template. */
	template: string;
}

/** The server-side fields a PageFilters maps to (all optional). */
export interface PageFilterStreamFields {
	published?: boolean;
	visible?: boolean;
	routable?: boolean;
	template?: string;
}

export function emptyPageFilters(): PageFilters {
	return { published: 'all', visible: 'all', routable: 'all', template: '' };
}

function triToBool(t: TriState): boolean | undefined {
	if (t === 'all') return undefined;
	return t === 'yes';
}

/** How many axes are actively constraining the result set. */
export function pageFilterCount(f: PageFilters): number {
	let n = 0;
	if (f.published !== 'all') n++;
	if (f.visible !== 'all') n++;
	if (f.routable !== 'all') n++;
	if (f.template !== '') n++;
	return n;
}

export function isPageFilterActive(f: PageFilters): boolean {
	return pageFilterCount(f) > 0;
}

/**
 * Project a PageFilters onto the StreamConfig fields. Only set keys are
 * returned, so spreading the result leaves unset axes untouched (and keeps the
 * stream key stable when nothing is filtered).
 */
/**
 * Client-side equivalent of the server filter, for the few code paths that
 * already hold a fully-loaded page array (e.g. the list view's search results,
 * which come back flat rather than through the chunk stream). Mirrors the
 * server's matchesFilters() predicate.
 */
export function matchesPageFilters(
	page: { published: boolean; visible: boolean; routable: boolean; template: string },
	f: PageFilters,
): boolean {
	if (f.published !== 'all' && page.published !== (f.published === 'yes')) return false;
	if (f.visible !== 'all' && page.visible !== (f.visible === 'yes')) return false;
	if (f.routable !== 'all' && page.routable !== (f.routable === 'yes')) return false;
	if (f.template !== '' && page.template !== f.template) return false;
	return true;
}

export function pageFilterStreamFields(f: PageFilters): PageFilterStreamFields {
	const out: PageFilterStreamFields = {};
	const published = triToBool(f.published);
	const visible = triToBool(f.visible);
	const routable = triToBool(f.routable);
	if (published !== undefined) out.published = published;
	if (visible !== undefined) out.visible = visible;
	if (routable !== undefined) out.routable = routable;
	if (f.template !== '') out.template = f.template;
	return out;
}
