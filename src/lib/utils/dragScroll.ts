// Svelte action: pointer drag-to-scroll for horizontal overflow containers.
// Native touch swipe + wheel still work; this only adds mouse/pen pointer drag.
export function dragScroll(node: HTMLElement) {
	let isDown = false;
	let moved = false;
	let startX = 0;
	let startScroll = 0;
	let pointerId = 0;

	function onPointerDown(e: PointerEvent) {
		// Only primary mouse / pen — leave touch to native scrolling.
		if (e.pointerType === 'touch' || e.button !== 0) return;
		// Don't hijack drags that start on interactive controls (buttons, links, inputs).
		const target = e.target as Element | null;
		if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
		isDown = true;
		moved = false;
		startX = e.clientX;
		startScroll = node.scrollLeft;
		pointerId = e.pointerId;
	}

	function onPointerMove(e: PointerEvent) {
		if (!isDown) return;
		const dx = e.clientX - startX;
		if (!moved && Math.abs(dx) > 4) {
			moved = true;
			node.setPointerCapture(pointerId);
			node.style.cursor = 'grabbing';
			node.style.userSelect = 'none';
		}
		if (moved) {
			node.scrollLeft = startScroll - dx;
			e.preventDefault();
		}
	}

	function onPointerUp() {
		if (moved) {
			node.style.cursor = '';
			node.style.userSelect = '';
			// Swallow the click that follows a drag so buttons inside don't fire.
			const swallow = (ev: Event) => {
				ev.stopPropagation();
				ev.preventDefault();
				node.removeEventListener('click', swallow, true);
			};
			node.addEventListener('click', swallow, true);
		}
		isDown = false;
		moved = false;
	}

	node.addEventListener('pointerdown', onPointerDown);
	node.addEventListener('pointermove', onPointerMove);
	node.addEventListener('pointerup', onPointerUp);
	node.addEventListener('pointercancel', onPointerUp);

	return {
		destroy() {
			node.removeEventListener('pointerdown', onPointerDown);
			node.removeEventListener('pointermove', onPointerMove);
			node.removeEventListener('pointerup', onPointerUp);
			node.removeEventListener('pointercancel', onPointerUp);
		}
	};
}
