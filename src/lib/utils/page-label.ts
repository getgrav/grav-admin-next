/**
 * The name a page goes by in the Pages tree, list and columns: its menu label
 * (`menu:` in the frontmatter), the name the site's navigation shows and the
 * one editors know the page by. Classic admin's page columns and list showed it
 * too (getgrav/grav-plugin-admin2#205). The API's `menu` falls back to the
 * title, as core's `menu()` does, so a page without `menu:` shows its title.
 */
export function pageLabel(page: { title: string; menu?: string | null }): string {
	const menu = typeof page.menu === 'string' ? page.menu.trim() : '';
	return menu !== '' ? menu : page.title;
}

/**
 * The page's title when its label is something else, for a tooltip, so a page
 * listed by its menu label can still be recognised by its title. Undefined
 * when the two are the same.
 */
export function pageTitleIfDifferent(page: { title: string; menu?: string | null }): string | undefined {
	return pageLabel(page) !== page.title ? page.title : undefined;
}
