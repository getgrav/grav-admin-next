import { api } from '../client';

/**
 * Visual emphasis for a menubar item. Maps to admin-next theme tokens (never a
 * raw color), so items stay readable in light and dark and follow the active
 * theme. Omit for the default muted icon button.
 */
export type MenubarItemVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger';

/**
 * Which toolbar zone an item renders in (admin2#81). `start` is the open space
 * on the left of the header — the default, and the spot to use for everyday
 * plugin actions so they sit well clear of the destructive Clear Cache button.
 * `end` places the item beside the core action cluster (View site / Clear
 * Cache) for buttons that genuinely belong with system maintenance. The core
 * actions themselves are never plugin-movable.
 */
export type MenubarPlacement = 'start' | 'end';

export interface MenubarItem {
	id: string;
	plugin: string;
	label: string;
	icon: string;
	/** Server action key — POSTed to /menubar/actions/{plugin}/{action} when clicked. */
	action: string;
	confirm?: string;
	/** Toolbar zone. Defaults to `start` (open space, away from Clear Cache). */
	placement?: MenubarPlacement;
	/**
	 * Ordering within a zone. Higher renders earlier (further left); ties keep
	 * plugin registration order. Matches the sidebar's `priority` semantics.
	 */
	priority?: number;
	/** Color emphasis. Defaults to a muted, icon-only button. */
	variant?: MenubarItemVariant;
	/**
	 * Render the `label` text beside the icon instead of using it only as a
	 * tooltip. Turns a 28px icon into a readable labelled button — the fix for
	 * "find Waldo" custom buttons (admin2#67).
	 */
	showLabel?: boolean;
	/** Button size. `sm` (default) is a compact icon; `md` is taller with roomier padding. */
	size?: 'sm' | 'md';
	/**
	 * Client-side intent (overrides the server `action`):
	 * `route` navigates the SPA (e.g. `/pages/new?parent=/blog&template=item`);
	 * `href` is a plain link to an external URL (or any address outside the SPA);
	 * `modal` opens a plugin modal web component.
	 */
	route?: string;
	/**
	 * External link target. When set, the item renders as a real `<a>` anchor
	 * (not an action button), matching the classic admin quick tray. Combine with
	 * `target` (e.g. `_blank`) to open in a new tab.
	 */
	href?: string;
	/** Anchor target for `href`, e.g. `_blank`. */
	target?: string;
	modal?: {
		component: string;
		title?: string;
		props?: Record<string, unknown>;
		size?: 'sm' | 'md' | 'lg' | 'xl';
		useStandardHeader?: boolean;
	};
}

export async function getMenubarItems(): Promise<MenubarItem[]> {
	return api.get<MenubarItem[]>('/menubar/items');
}

export async function executeMenubarAction(
	plugin: string,
	action: string,
	body?: Record<string, unknown>,
): Promise<{ status: string; message: string }> {
	return api.post<{ status: string; message: string }>(
		`/menubar/actions/${plugin}/${action}`,
		body,
	);
}
