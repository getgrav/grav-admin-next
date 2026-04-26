// Svelte action: move the node to document.body so its `position: fixed`
// is relative to the viewport, not an ancestor with `transform`,
// `filter`, `perspective`, etc. (which establish a containing block).
export function portal(node: HTMLElement, target: HTMLElement | string = document.body) {
	const targetEl = typeof target === 'string' ? document.querySelector(target) as HTMLElement : target;
	if (targetEl) targetEl.appendChild(node);
	return {
		destroy() {
			if (node.parentNode) node.parentNode.removeChild(node);
		}
	};
}
