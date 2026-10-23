/**
 * Helpers for the module list in a modular page's editor: which children are
 * modules, whether a page is a modular page at all, and what each module's
 * type is called.
 */

interface PageLike {
	slug?: string;
	folder?: string;
	template?: string;
	header?: Record<string, unknown>;
}

/** A module's folder name starts with `_`, after any `01.` order prefix. */
export function isModule(page: PageLike): boolean {
	const name = page.folder || page.slug || '';
	return name.replace(/^\d+\./, '').startsWith('_');
}

/**
 * Every collection source a `content.items` value names, as the strings core
 * reads them: `'@self.modular'`, a list of them (`['@self.modular']`), the
 * selector map `{ '@self': 'modular' }` (read as `@self.modular`), or a list of
 * those. A list is walked the same way at any depth.
 */
function itemSources(items: unknown): string[] {
	if (typeof items === 'string') return [items];
	if (Array.isArray(items)) return items.flatMap(itemSources);
	if (items && typeof items === 'object') {
		return Object.entries(items as Record<string, unknown>).flatMap(([key, value]) => [
			key,
			...(typeof value === 'string' ? [`${key}.${value}`] : []),
		]);
	}
	return [];
}

/**
 * Whether a page draws modules: its template is `modular`, or its collection
 * is its own modules (`content: items: '@self.modular'`, or the older
 * `self@.modular`, alone or in a list). Told from the page alone, so the editor
 * never has to load a big blog's children to find out.
 */
export function isModularPage(page: PageLike | null | undefined): boolean {
	if (!page || isModule(page)) return false;
	if (page.template === 'modular') return true;
	const content = page.header?.content;
	const items = content && typeof content === 'object' ? (content as Record<string, unknown>).items : undefined;
	return itemSources(items).some((source) => /^(@self|self@)\.modular$/.test(source.trim()));
}

/** `featured_product` → "Featured product", the name core gives a type with no blueprint title. */
export function humanizeType(template: string): string {
	const name = template.replace(/^modular\//, '').replace(/[-_]+/g, ' ').trim();
	return name ? name.charAt(0).toUpperCase() + name.slice(1) : template;
}

/**
 * What a module's type is called: the label the API lists for its template
 * (its blueprint's title), or the template name made readable.
 */
export function moduleTypeLabel(template: string | undefined, types: Array<{ type: string; label: string }>): string {
	if (!template) return '';
	const key = template.startsWith('modular/') ? template : `modular/${template}`;
	return types.find((t) => t.type === key)?.label ?? humanizeType(template);
}

/**
 * The drop position (counted with the module still in its place, as
 * `buildMoveOps` takes it) for moving the module at `from` one step up or
 * down, or null when it is already at that end.
 */
export function stepInsertIndex(from: number, count: number, step: -1 | 1): number | null {
	if (from < 0 || from >= count) return null;
	if (step === -1) return from === 0 ? null : from - 1;
	return from === count - 1 ? null : from + 2;
}
