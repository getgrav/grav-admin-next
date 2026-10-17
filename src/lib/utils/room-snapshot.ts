/**
 * The Settings fields that describe where a page's folder sits on disk: its
 * folder name, parent, whether it carries a numeric prefix, and that prefix.
 * The page editor saves a change to any of them as a move, not as a header
 * write.
 */
export const FOLDER_SETTINGS = ['folder', 'route', 'ordering', 'order'] as const;

/**
 * A collab room's snapshot, with the folder Settings taken from the page as
 * it was loaded from disk instead of from the room.
 *
 * A room is kept per route and seeded once, so it still holds the folder
 * prefix the page had when it was first opened. A reorder in the Tree or
 * Columns view keeps the route and never goes through the room, so taking
 * those values from the room made the editor think the prefix had been
 * changed back, and Save moved the page back to its old number
 * (getgrav/grav#4361). The folder only changes through a move, which the
 * editor makes itself, so the page on disk is the one to trust.
 */
export function withFolderSettings(
	snap: Record<string, unknown>,
	current: Record<string, unknown>,
): Record<string, unknown> {
	const next = { ...snap };
	for (const key of FOLDER_SETTINGS) {
		if (key in current) next[key] = current[key];
		else delete next[key];
	}
	return next;
}
