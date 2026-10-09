/**
 * Keyboard mode: a `data-keyboard-nav` flag on <html> while someone is moving
 * around the admin with the keyboard, which is what turns focus rings on for
 * buttons and links (see the focus-ring rules in routes/layout.css).
 *
 * The browser's own `:focus-visible` is not enough on its own: it switches on
 * at any key press, so pressing a screenshot hotkey lit up a ring in every
 * capture. Only keys that move focus count here, and only without Cmd, Ctrl
 * or Alt held, so a shortcut never turns the rings on. The next mouse or touch
 * press turns them off again.
 */
const NAV_KEYS = new Set([
	'Tab',
	'ArrowUp',
	'ArrowDown',
	'ArrowLeft',
	'ArrowRight',
	'Home',
	'End',
	'PageUp',
	'PageDown'
]);

export function trackKeyboardNav(root: HTMLElement = document.documentElement): () => void {
	const onKey = (e: KeyboardEvent) => {
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		if (NAV_KEYS.has(e.key)) root.setAttribute('data-keyboard-nav', '');
	};
	const onPointer = () => root.removeAttribute('data-keyboard-nav');

	window.addEventListener('keydown', onKey, true);
	window.addEventListener('pointerdown', onPointer, true);
	return () => {
		window.removeEventListener('keydown', onKey, true);
		window.removeEventListener('pointerdown', onPointer, true);
		root.removeAttribute('data-keyboard-nav');
	};
}
