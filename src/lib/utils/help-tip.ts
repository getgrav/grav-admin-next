/**
 * Small helpers shared by the help icon (HelpTip.svelte) and `<grav-help>`.
 */

/**
 * Cancel a click on help text so it cannot reach a `<label>` the help sits
 * inside: without this, clicking the words would focus the field or flip a
 * checkbox. A click on a link is left alone, so the link still works.
 */
export function guardLabelClick(e: Event): void {
	if (!e.composedPath().some((node) => node instanceof HTMLAnchorElement)) e.preventDefault();
}

/**
 * The label text that a `<grav-help>` belongs to, for naming its icon: the
 * `<label>` it sits inside, or the `<label>` just before it. Empty when neither
 * is there, and the icon is then simply named "Help".
 */
export function nearbyLabelText(host: Element): string {
	const label = host.closest('label') ?? (host.previousElementSibling?.tagName === 'LABEL' ? host.previousElementSibling : null);
	if (!label) return '';
	// Read a copy, so other `<grav-help>` elements and their help are left out.
	const copy = label.cloneNode(true) as Element;
	copy.querySelectorAll('grav-help, script, style').forEach((el) => el.remove());
	return (copy.textContent ?? '').replace(/\s+/g, ' ').replace(/\s*\*$/, '').trim();
}
