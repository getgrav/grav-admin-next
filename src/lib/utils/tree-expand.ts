/**
 * Opening and closing a folder in the Pages tree (admin2#200).
 *
 * A folder opens the moment it is clicked, so its chevron can show that its
 * pages are loading, and the first chunk loads after that. Closing a folder
 * while that chunk is still loading keeps it closed: the open set is read
 * again once the load settles instead of being written back from the copy
 * taken before it started.
 */
export interface FolderToggleDeps {
	/** The folders open right now. */
	expanded(): ReadonlySet<string>;
	/** Store a new set of open folders (and remember it). */
	setExpanded(next: Set<string>): void;
	/** Load the folder's first chunk; resolves false when the request failed. */
	load(route: string): Promise<boolean>;
}

export type FolderToggleResult = 'closed' | 'loaded' | 'failed' | 'closed-while-loading';

export async function toggleFolder(route: string, deps: FolderToggleDeps): Promise<FolderToggleResult> {
	const next = new Set(deps.expanded());
	if (next.has(route)) {
		next.delete(route);
		deps.setExpanded(next);
		return 'closed';
	}

	next.add(route);
	deps.setExpanded(next);

	const ok = await deps.load(route);
	if (!deps.expanded().has(route)) return 'closed-while-loading';
	return ok ? 'loaded' : 'failed';
}
