<script lang="ts">
	import { on } from 'svelte/events';
	import type { Snippet } from 'svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { guardLabelClick } from '$lib/utils/help-tip';

	/**
	 * The small info icon that holds a field's help text, and the tooltip it opens.
	 *
	 * Used by FieldHelp (every blueprint field) and by the `<grav-help>` element,
	 * so the two behave the same. Its CSS is plain and lives in help-tip.css,
	 * because the element draws this inside a shadow root.
	 *
	 * Hover or keyboard focus shows the tooltip. A click or tap pins it open so a
	 * link inside it can be clicked; Escape or a click or focus move elsewhere
	 * closes it. The tooltip is a manual popover, which puts it in the browser's
	 * top layer: nothing clips it and nothing paints over it, in a scroll
	 * container, a modal or a shadow root. The popover API only supplies the
	 * layer, and its position is worked out here from the icon's rectangle.
	 *
	 * The icon can sit inside a `<label>`. Its click is cancelled so it never
	 * focuses or toggles the field, and so is a click on plain text in the tooltip.
	 */
	interface Props {
		/** What the help is for, already translated. Names the button for screen readers. */
		label?: string;
		/** Drop the left margin, for an icon inside a flex label that already has a gap. */
		flush?: boolean;
		/** The help itself. */
		children: Snippet;
	}

	let { label = '', flush = false, children }: Props = $props();

	const uid = $props.id();
	const popupId = `grav-help-${uid}`;

	let wrapper = $state<HTMLElement>();
	let button = $state<HTMLButtonElement>();
	let popup = $state<HTMLElement>();

	let hovering = $state(false);
	let focused = $state(false);
	let pinned = $state(false);
	const open = $derived(hovering || focused || pinned);

	const buttonLabel = $derived(
		label ? i18n.t('ADMIN_NEXT.HELP_FOR_LABEL', { label }) : i18n.t('ADMIN_NEXT.HELP')
	);

	// Give the pointer a moment to cross the gap between the icon and the tooltip.
	let leaveTimer: ReturnType<typeof setTimeout> | undefined;

	function place() {
		if (!button || !popup) return;
		const anchor = button.getBoundingClientRect();
		const viewW = document.documentElement.clientWidth;
		const viewH = document.documentElement.clientHeight;
		const pad = 8;
		const gap = 6;
		const w = popup.offsetWidth;
		const h = popup.offsetHeight;

		const left = Math.max(pad, Math.min(anchor.left + anchor.width / 2 - w / 2, viewW - w - pad));
		let top = anchor.bottom + gap;
		// Flip above the icon when there is no room below and there is room above.
		if (top + h > viewH - pad && anchor.top - gap - h >= pad) top = anchor.top - gap - h;
		top = Math.max(pad, top);

		popup.style.left = `${left}px`;
		popup.style.top = `${top}px`;
	}

	function show() {
		if (!popup) return;
		popup.setAttribute('data-open', '');
		try {
			if (!popup.matches(':popover-open')) popup.showPopover();
		} catch {
			/* No popover API: the tooltip still shows, as a fixed box. */
		}
		place();
	}

	function hide() {
		if (!popup) return;
		popup.removeAttribute('data-open');
		try {
			if (popup.matches(':popover-open')) popup.hidePopover();
		} catch {
			/* nothing to hide */
		}
	}

	function closeAll() {
		clearTimeout(leaveTimer);
		hovering = false;
		focused = false;
		pinned = false;
	}

	/** Does this event come from inside the icon or its tooltip? */
	function fromInside(e: Event): boolean {
		return !!wrapper && e.composedPath().includes(wrapper);
	}

	// Wire the listeners by hand rather than with onclick={…}: Svelte delegates
	// those, and this component also runs inside `<grav-help>`'s shadow root.
	$effect(() => {
		if (!wrapper || !button || !popup) return;
		const offs = [
			on(wrapper, 'pointerenter', (e) => {
				if (e.pointerType === 'touch') return;
				clearTimeout(leaveTimer);
				hovering = true;
			}),
			on(wrapper, 'pointerleave', (e) => {
				if (e.pointerType === 'touch') return;
				clearTimeout(leaveTimer);
				leaveTimer = setTimeout(() => (hovering = false), 150);
			}),
			on(button, 'focusin', () => {
				// Only keyboard focus opens it. A mouse click focuses the button too, and
				// that click is about to pin the tooltip anyway.
				if (button!.matches(':focus-visible')) focused = true;
			}),
			on(button, 'focusout', () => (focused = false)),
			on(button, 'click', (e) => {
				// Inside a <label>, a click would otherwise focus or toggle the field.
				e.preventDefault();
				pinned = !pinned;
			}),
			// Same for plain text in the tooltip, but leave links alone.
			on(popup, 'click', guardLabelClick),
		];
		return () => {
			for (const off of offs) off();
			clearTimeout(leaveTimer);
		};
	});

	// Open and close the popover, and while it is open, listen for what closes it.
	$effect(() => {
		if (!open) {
			hide();
			return;
		}
		show();
		const offs = [
			on(window, 'keydown', (e) => {
				if (e.key !== 'Escape') return;
				e.stopPropagation();
				closeAll();
			}, { capture: true }),
			on(window, 'resize', place),
			on(window, 'scroll', place, { capture: true, passive: true }),
		];
		if (pinned) {
			offs.push(
				on(document, 'pointerdown', (e) => { if (!fromInside(e)) pinned = false; }, { capture: true }),
				on(document, 'focusin', (e) => { if (!fromInside(e)) pinned = false; }),
			);
		}
		return () => {
			for (const off of offs) off();
		};
	});

	// A tooltip left open when its field goes away would stay in the top layer.
	$effect(() => () => hide());
</script>

<span bind:this={wrapper} class="grav-help-tip" class:grav-help-tip--flush={flush}>
	<button
		bind:this={button}
		type="button"
		class="grav-help-tip__button"
		aria-label={buttonLabel}
		aria-expanded={open}
		aria-describedby={popupId}
	>
		<svg class="grav-help-tip__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<circle cx="12" cy="12" r="10" />
			<path d="M12 16v-4" />
			<path d="M12 8h.01" />
		</svg>
	</button>
	<span bind:this={popup} id={popupId} class="grav-help-tip__popup" role="tooltip" popover="manual">
		{@render children()}
	</span>
</span>
