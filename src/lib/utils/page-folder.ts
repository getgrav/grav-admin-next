/**
 * The name the editor's Folder Name field edits: the page folder without its
 * numeric order prefix (`02.typography` gives `typography`).
 *
 * Not `slug`: a `slug:` in the frontmatter changes the page's route but never
 * its folder, so a page in `02.typography` with `slug: my-slug` showed
 * `my-slug` as its folder name, and moving or renumbering it renamed the folder
 * to `NN.my-slug` (getgrav/grav-admin-next#40). `slug` is only the fallback for
 * an API too old to send `folder`. Leading periods are dropped, as the move
 * endpoint drops them.
 */
export function pageFolderName(page: { folder?: string | null; slug: string }): string {
	const name = page.folder ? page.folder.replace(/^\d+\./, '') : page.slug;
	return name.replace(/^\.+/, '');
}
