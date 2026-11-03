import { getContext, setContext } from 'svelte';

/**
 * Read-only blueprint forms (admin2#209).
 *
 * A form opened for someone who may view but not change the data — a page
 * whose own permissions deny them `update` — is drawn with every control
 * disabled. BlueprintForm publishes the flag; fields that draw controls a
 * `<fieldset disabled>` can't reach (list add/remove/reorder, the toggleable
 * checkbox, rich editors) read it here.
 */
const KEY = 'blueprintReadonly';

/** Publish the read-only flag to every field below. Call during component init. */
export function setFormReadonly(get: () => boolean): void {
	setContext(KEY, get);
}

/**
 * The read-only flag as a getter, false outside a read-only form. Call during
 * component init and read the getter where it is used, so it stays reactive.
 */
export function formReadonly(): () => boolean {
	const get = getContext<(() => boolean) | undefined>(KEY);
	return get ?? (() => false);
}
